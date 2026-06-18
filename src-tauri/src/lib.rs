use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};
use image::{
    imageops::FilterType, metadata::Orientation, DynamicImage, ImageDecoder, ImageReader, Rgb,
    RgbImage,
};
use mozjpeg_rs::{Encoder, Preset};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
enum JpegCompressionMode {
    Fast,
    Balanced,
    Max,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompressionSettings {
    preserve_original_dimensions: bool,
    max_width: u32,
    max_height: u32,
    quality: u8,
    jpeg_compression_mode: JpegCompressionMode,
    keep_aspect_ratio: bool,
    strip_metadata: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageDimensions {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCompressionResponse {
    contents: Vec<u8>,
    original_dimensions: ImageDimensions,
    final_dimensions: ImageDimensions,
}

#[tauri::command]
fn read_image(path: PathBuf) -> Result<Response, String> {
    let contents = fs::read(path).map_err(|error| error.to_string())?;
    Ok(Response::new(contents))
}

fn decoded_header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .ok_or_else(|| format!("Cabecalho ausente: {name}"))?
        .to_str()
        .map_err(|error| error.to_string())?;

    urlencoding::decode(value)
        .map(|value| value.into_owned())
        .map_err(|error| error.to_string())
}

fn write_compressed_image(
    source_path: &Path,
    file_name: &str,
    contents: &[u8],
) -> Result<PathBuf, String> {
    let requested_name = Path::new(&file_name);

    if requested_name.file_name() != Some(OsStr::new(&file_name)) {
        return Err("Nome de arquivo de saida invalido.".into());
    }

    let parent = source_path
        .parent()
        .ok_or_else(|| "A imagem original nao possui uma pasta valida.".to_string())?;
    let destination = parent.join(requested_name);

    fs::write(&destination, contents).map_err(|error| error.to_string())?;
    Ok(destination)
}

fn write_compressed_image_to_path(
    destination_path: &Path,
    file_name: &str,
    contents: &[u8],
) -> Result<PathBuf, String> {
    let requested_name = Path::new(file_name);

    if requested_name.file_name() != Some(OsStr::new(file_name)) {
        return Err("Nome de arquivo de saida invalido.".into());
    }

    if destination_path.file_name() != Some(OsStr::new(file_name)) {
        return Err("Caminho de destino invalido.".into());
    }

    let parent = destination_path
        .parent()
        .ok_or_else(|| "O caminho de destino nao possui uma pasta valida.".to_string())?;

    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(destination_path, contents).map_err(|error| error.to_string())?;
    Ok(destination_path.to_path_buf())
}

fn load_image(
    source_path: &Path,
    strip_metadata: bool,
) -> Result<(DynamicImage, Option<Vec<u8>>, Option<Vec<u8>>), String> {
    let mut decoder = ImageReader::open(source_path)
        .map_err(|error| error.to_string())?
        .into_decoder()
        .map_err(|error| error.to_string())?;

    let orientation = decoder.orientation().map_err(|error| error.to_string())?;
    let mut exif_data = if strip_metadata {
        None
    } else {
        decoder.exif_metadata().map_err(|error| error.to_string())?
    };
    let icc_profile = if strip_metadata {
        None
    } else {
        decoder.icc_profile().map_err(|error| error.to_string())?
    };

    if let Some(exif_chunk) = exif_data.as_mut() {
        let _ = Orientation::remove_from_exif_chunk(exif_chunk);
    }

    let mut image = DynamicImage::from_decoder(decoder).map_err(|error| error.to_string())?;
    image.apply_orientation(orientation);

    Ok((image, exif_data, icc_profile))
}

fn get_target_dimensions(
    width: u32,
    height: u32,
    settings: &CompressionSettings,
) -> ImageDimensions {
    if settings.preserve_original_dimensions {
        return ImageDimensions { width, height };
    }

    if !settings.keep_aspect_ratio {
        return ImageDimensions {
            width: settings.max_width.max(1),
            height: settings.max_height.max(1),
        };
    }

    let scale = f64::min(
        f64::min(
            settings.max_width.max(1) as f64 / width.max(1) as f64,
            settings.max_height.max(1) as f64 / height.max(1) as f64,
        ),
        1.0,
    );

    ImageDimensions {
        width: ((width as f64) * scale).round().max(1.0) as u32,
        height: ((height as f64) * scale).round().max(1.0) as u32,
    }
}

fn resize_image(image: DynamicImage, settings: &CompressionSettings) -> (DynamicImage, ImageDimensions) {
    let original_dimensions = ImageDimensions {
        width: image.width(),
        height: image.height(),
    };
    let final_dimensions =
        get_target_dimensions(original_dimensions.width, original_dimensions.height, settings);

    if final_dimensions.width == original_dimensions.width
        && final_dimensions.height == original_dimensions.height
    {
        return (image, final_dimensions);
    }

    let resized = if settings.keep_aspect_ratio {
        image.resize(final_dimensions.width, final_dimensions.height, FilterType::Lanczos3)
    } else {
        image.resize_exact(final_dimensions.width, final_dimensions.height, FilterType::Lanczos3)
    };

    (resized, final_dimensions)
}

fn flatten_to_rgb(image: DynamicImage) -> RgbImage {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut rgb = RgbImage::new(width, height);

    for (x, y, pixel) in rgba.enumerate_pixels() {
        let [red, green, blue, alpha] = pixel.0;

        if alpha == 255 {
            rgb.put_pixel(x, y, Rgb([red, green, blue]));
            continue;
        }

        let alpha = alpha as u32;
        let blend = |channel: u8| -> u8 {
            (((channel as u32 * alpha) + (255 * (255 - alpha))) / 255) as u8
        };

        rgb.put_pixel(x, y, Rgb([blend(red), blend(green), blend(blue)]));
    }

    rgb
}

fn encode_jpeg(
    rgb: &RgbImage,
    settings: &CompressionSettings,
    exif_data: Option<Vec<u8>>,
    icc_profile: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    let preset = match settings.jpeg_compression_mode {
        JpegCompressionMode::Fast => Preset::BaselineFastest,
        JpegCompressionMode::Balanced => Preset::ProgressiveBalanced,
        JpegCompressionMode::Max => Preset::ProgressiveSmallest,
    };
    let mut encoder = Encoder::new(preset).quality(settings.quality);

    if !settings.strip_metadata {
        if let Some(exif_data) = exif_data {
            encoder = encoder.exif_data(exif_data);
        }

        if let Some(icc_profile) = icc_profile {
            encoder = encoder.icc_profile(icc_profile);
        }
    }

    encoder
        .encode_rgb(rgb.as_raw(), rgb.width(), rgb.height())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn compress_jpeg_image(
    source_path: PathBuf,
    settings: CompressionSettings,
) -> Result<NativeCompressionResponse, String> {
    let (image, exif_data, icc_profile) = load_image(&source_path, settings.strip_metadata)?;
    let original_dimensions = ImageDimensions {
        width: image.width(),
        height: image.height(),
    };
    let (image, final_dimensions) = resize_image(image, &settings);
    let rgb = flatten_to_rgb(image);
    let contents = encode_jpeg(&rgb, &settings, exif_data, icc_profile)?;

    Ok(NativeCompressionResponse {
        contents,
        original_dimensions,
        final_dimensions,
    })
}

#[tauri::command]
fn save_compressed_image(request: Request<'_>) -> Result<String, String> {
    let file_name = decoded_header(&request, "x-file-name")?;
    let InvokeBody::Raw(contents) = request.body() else {
        return Err("Os dados da imagem compactada sao invalidos.".into());
    };

    let destination = match request.headers().get("x-destination-path") {
        Some(_) => {
            let destination_path = PathBuf::from(decoded_header(&request, "x-destination-path")?);
            write_compressed_image_to_path(&destination_path, &file_name, contents)?
        }
        None => {
            let source_path = PathBuf::from(decoded_header(&request, "x-source-path")?);
            write_compressed_image(&source_path, &file_name, contents)?
        }
    };

    Ok(destination.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_image,
            compress_jpeg_image,
            save_compressed_image
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Compact Img");
}

#[cfg(test)]
mod tests {
    use super::{write_compressed_image, write_compressed_image_to_path};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_directory() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("relogio do sistema invalido")
            .as_nanos();
        std::env::temp_dir().join(format!("compact-img-test-{}-{suffix}", std::process::id()))
    }

    #[test]
    fn saves_next_to_the_original_image() {
        let directory = temporary_directory();
        fs::create_dir_all(&directory).expect("nao foi possivel criar a pasta de teste");
        let source = directory.join("foto.jpg");
        let expected = directory.join("foto-compactado.webp");

        let destination = write_compressed_image(&source, "foto-compactado.webp", b"imagem")
            .expect("nao foi possivel salvar a imagem");

        assert_eq!(destination, expected);
        assert_eq!(
            fs::read(expected).expect("arquivo de saida ausente"),
            b"imagem"
        );
        fs::remove_dir_all(directory).expect("nao foi possivel limpar a pasta de teste");
    }

    #[test]
    fn rejects_output_outside_the_original_directory() {
        let source = temporary_directory().join("foto.jpg");
        let result = write_compressed_image(&source, "../foto.webp", b"imagem");

        assert!(result.is_err());
    }

    #[test]
    fn saves_to_a_custom_destination_path() {
        let directory = temporary_directory();
        let destination = directory.join("saida").join("foto-compactado.webp");

        let saved = write_compressed_image_to_path(&destination, "foto-compactado.webp", b"imagem")
            .expect("nao foi possivel salvar a imagem em caminho customizado");

        assert_eq!(saved, destination);
        assert_eq!(
            fs::read(destination).expect("arquivo de saida ausente"),
            b"imagem"
        );
        fs::remove_dir_all(directory).expect("nao foi possivel limpar a pasta de teste");
    }
}
