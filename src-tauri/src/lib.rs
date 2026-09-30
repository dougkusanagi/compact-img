use std::{
    ffi::OsStr,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use fast_image_resize::{
    images::Image as ResizeImage, FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
};
use image::{
    codecs::{
        avif::AvifEncoder,
        png::{CompressionType, FilterType as PngFilterType, PngEncoder},
    },
    metadata::Orientation,
    DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageReader,
};
use mozjpeg_rs::{Encoder, Preset};
use serde::Deserialize;
use tauri::ipc::{InvokeBody, Request, Response};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
enum JpegCompressionMode {
    Fast,
    Balanced,
    Max,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
enum OutputFormat {
    #[default]
    Jpeg,
    Webp,
    Png,
    Avif,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompressionSettings {
    #[serde(default)]
    output_format: OutputFormat,
    preserve_original_dimensions: bool,
    max_width: u32,
    max_height: u32,
    quality: u8,
    jpeg_compression_mode: JpegCompressionMode,
    keep_aspect_ratio: bool,
    strip_metadata: bool,
    #[serde(default)]
    compression_mode: Option<String>,
    #[serde(default)]
    #[serde(rename = "maxFileSizeKB")]
    max_file_size_k_b: Option<u32>,
    #[serde(default)]
    jpeg_background_color: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct ImageDimensions {
    width: u32,
    height: u32,
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

#[cfg(test)]
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

#[cfg(test)]
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
        .with_guessed_format()
        .map_err(|error| error.to_string())?
        .into_decoder()
        .map_err(|error| error.to_string())?;

    let orientation = decoder.orientation().map_err(|error| error.to_string())?;
    let mut exif_data = if strip_metadata {
        None
    } else {
        decoder.exif_metadata().map_err(|error| error.to_string())?
    };
    // Privacy strips EXIF/location, while retaining the color profile.
    let icc_profile = decoder.icc_profile().map_err(|error| error.to_string())?;

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
            width: settings.max_width.min(width).max(1),
            height: settings.max_height.min(height).max(1),
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

/// Pixels em RGB8 (3 canais) ou RGBA8 (4 canais), sem alinhamento extra.
#[derive(Clone)]
struct PixelBuffer {
    width: u32,
    height: u32,
    has_alpha: bool,
    data: Vec<u8>,
}

fn into_pixel_buffer(image: DynamicImage) -> PixelBuffer {
    let (width, height) = (image.width(), image.height());
    if image.color().has_alpha() {
        PixelBuffer {
            width,
            height,
            has_alpha: true,
            data: image.into_rgba8().into_raw(),
        }
    } else {
        PixelBuffer {
            width,
            height,
            has_alpha: false,
            data: image.into_rgb8().into_raw(),
        }
    }
}

fn resize_pixels(
    pixels: PixelBuffer,
    target: ImageDimensions,
) -> Result<PixelBuffer, String> {
    if target.width == pixels.width && target.height == pixels.height {
        return Ok(pixels);
    }

    let pixel_type = if pixels.has_alpha {
        PixelType::U8x4
    } else {
        PixelType::U8x3
    };
    let has_alpha = pixels.has_alpha;
    let source = ResizeImage::from_vec_u8(pixels.width, pixels.height, pixels.data, pixel_type)
        .map_err(|error| error.to_string())?;
    let mut destination = ResizeImage::new(target.width, target.height, pixel_type);

    Resizer::new()
        .resize(
            &source,
            &mut destination,
            &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3)),
        )
        .map_err(|error| error.to_string())?;

    Ok(PixelBuffer {
        width: target.width,
        height: target.height,
        has_alpha,
        data: destination.into_vec(),
    })
}

/// Compoe os pixels transparentes sobre fundo branco e devolve RGB8.
fn flatten_to_rgb(pixels: &PixelBuffer, background: [u8; 3]) -> Vec<u8> {
    if !pixels.has_alpha {
        return pixels.data.clone();
    }

    let mut rgb = Vec::with_capacity(pixels.data.len() / 4 * 3);
    for pixel in pixels.data.chunks_exact(4) {
        let alpha = pixel[3] as u32;
        if alpha == 255 {
            rgb.extend_from_slice(&pixel[..3]);
            continue;
        }

        for (index, channel) in pixel[..3].iter().enumerate() {
            rgb.push((((*channel as u32 * alpha) + (background[index] as u32 * (255 - alpha))) / 255) as u8);
        }
    }
    rgb
}

fn encode_jpeg(
    rgb: &[u8],
    width: u32,
    height: u32,
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

    }
    if let Some(icc_profile) = icc_profile { encoder = encoder.icc_profile(icc_profile); }

    encoder
        .encode_rgb(rgb, width, height)
        .map_err(|error| error.to_string())
}

fn encode_webp(pixels: &PixelBuffer, quality: u8) -> Result<Vec<u8>, String> {
    let encoder = if pixels.has_alpha {
        webp::Encoder::from_rgba(&pixels.data, pixels.width, pixels.height)
    } else {
        webp::Encoder::from_rgb(&pixels.data, pixels.width, pixels.height)
    };

    Ok(encoder.encode(quality as f32).to_vec())
}

fn encode_png(pixels: &PixelBuffer) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    PngEncoder::new_with_quality(&mut output, CompressionType::Default, PngFilterType::Adaptive)
        .write_image(&pixels.data, pixels.width, pixels.height, color_type(pixels))
        .map_err(|error| error.to_string())?;
    Ok(output)
}

fn encode_avif(pixels: &PixelBuffer, quality: u8) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    AvifEncoder::new_with_speed_quality(&mut output, 6, quality)
        .write_image(&pixels.data, pixels.width, pixels.height, color_type(pixels))
        .map_err(|error| error.to_string())?;
    Ok(output)
}

fn color_type(pixels: &PixelBuffer) -> ExtendedColorType {
    if pixels.has_alpha {
        ExtendedColorType::Rgba8
    } else {
        ExtendedColorType::Rgb8
    }
}

fn encode_pixels(
    pixels: &PixelBuffer,
    settings: &CompressionSettings,
    exif_data: Option<Vec<u8>>,
    icc_profile: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    match settings.output_format {
        OutputFormat::Jpeg => {
            let (width, height) = (pixels.width, pixels.height);
            let color = settings.jpeg_background_color.as_deref().unwrap_or("#ffffff");
            let background = if color.len() == 7 && color.starts_with('#') && color[1..].bytes().all(|c| c.is_ascii_hexdigit()) {
                [u8::from_str_radix(&color[1..3], 16).unwrap(), u8::from_str_radix(&color[3..5], 16).unwrap(), u8::from_str_radix(&color[5..7], 16).unwrap()]
            } else { [255; 3] };
            let rgb = flatten_to_rgb(pixels, background);
            encode_jpeg(&rgb, width, height, settings, exif_data, icc_profile)
        }
        OutputFormat::Webp => encode_webp(&pixels, settings.quality),
        OutputFormat::Png => encode_png(&pixels),
        OutputFormat::Avif => encode_avif(&pixels, settings.quality),
    }
}

fn encode_native_compression_payload(
    contents: Vec<u8>,
    original_dimensions: ImageDimensions,
    final_dimensions: ImageDimensions,
) -> Vec<u8> {
    let header = format!(
        "{},{},{},{}\n",
        original_dimensions.width,
        original_dimensions.height,
        final_dimensions.width,
        final_dimensions.height
    );
    let mut payload = Vec::with_capacity(header.len() + contents.len());
    payload.extend_from_slice(header.as_bytes());
    payload.extend_from_slice(&contents);
    payload
}

fn compress_image_blocking(
    source_path: PathBuf,
    settings: CompressionSettings,
) -> Result<Vec<u8>, String> {
    let (image, exif_data, icc_profile) = load_image(&source_path, settings.strip_metadata)?;
    let original_dimensions = ImageDimensions {
        width: image.width(),
        height: image.height(),
    };
    let mut final_dimensions = get_target_dimensions(
        original_dimensions.width,
        original_dimensions.height,
        &settings,
    );
    let mut pixels = resize_pixels(into_pixel_buffer(image), final_dimensions)?;
    let mut contents;
    if settings.compression_mode.as_deref() == Some("target-size") {
        let resize_source = pixels.clone();
        let target = settings.max_file_size_k_b.unwrap_or(300) as usize * 1024;
        if target < 1024 { return Err("Peso máximo inválido. Use pelo menos 1 KB.".into()); }
        let mut candidate_settings = settings.clone();
        let mut best = None;
        for _ in 0..18 {
            candidate_settings.quality = 100;
            contents = encode_pixels(&pixels, &candidate_settings, exif_data.clone(), icc_profile.clone())?;
            if contents.len() <= target { best = Some(contents); break; }
            if !matches!(settings.output_format, OutputFormat::Png) {
                candidate_settings.quality = 1;
                contents = encode_pixels(&pixels, &candidate_settings, exif_data.clone(), icc_profile.clone())?;
                if contents.len() <= target {
                    let mut winner = contents;
                    let (mut low, mut high) = (2i16, 99i16);
                    while low <= high {
                        let quality = (low + high) / 2;
                        candidate_settings.quality = quality as u8;
                        let candidate = encode_pixels(&pixels, &candidate_settings, exif_data.clone(), icc_profile.clone())?;
                        if candidate.len() <= target { winner = candidate; low = quality + 1; }
                        else { high = quality - 1; }
                    }
                    best = Some(winner); break;
                }
            }
            if settings.preserve_original_dimensions || (final_dimensions.width == 1 && final_dimensions.height == 1) { break; }
            let scale = ((target as f64 / contents.len() as f64).sqrt() * 0.9).clamp(0.1, 0.8);
            final_dimensions = ImageDimensions { width: ((final_dimensions.width as f64 * scale) as u32).max(1), height: ((final_dimensions.height as f64 * scale) as u32).max(1) };
            pixels = resize_pixels(resize_source.clone(), final_dimensions)?;
        }
        contents = best.ok_or("Não foi possível atingir o peso máximo. Permita reduzir as dimensões, aumente o limite ou escolha outro formato.")?;
    } else { contents = encode_pixels(&pixels, &settings, exif_data, icc_profile)?; }

    Ok(encode_native_compression_payload(
        contents,
        original_dimensions,
        final_dimensions,
    ))
}

#[tauri::command]
async fn compress_image(
    source_path: PathBuf,
    settings: CompressionSettings,
) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || compress_image_blocking(source_path, settings))
        .await
        .map_err(|error| error.to_string())?
        .map(Response::new)
}

/// Le largura e altura apenas do cabecalho, sem decodificar a imagem inteira.
#[tauri::command]
async fn read_image_dimensions(path: PathBuf) -> Result<(u32, u32), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let reader = ImageReader::open(path)
            .map_err(|error| error.to_string())?
            .with_guessed_format()
            .map_err(|error| error.to_string())?;
        let decoder = reader.into_decoder().map_err(|error| error.to_string())?;
        let (width, height) = decoder.dimensions();
        // A orientacao EXIF troca largura e altura em fotos giradas.
        let mut decoder = decoder;
        let orientation = decoder.orientation().map_err(|error| error.to_string())?;
        Ok(match orientation {
            Orientation::Rotate90
            | Orientation::Rotate270
            | Orientation::Rotate90FlipH
            | Orientation::Rotate270FlipH => (height, width),
            _ => (width, height),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Exclusive creation makes rename/skip safe even if another process saves concurrently.
fn save_with_policy(destination: &Path, source: Option<&Path>, contents: &[u8], policy: &str) -> Result<Option<PathBuf>, String> {
    if let Some(source) = source {
        if destination == source || (destination.exists() && fs::canonicalize(destination).ok() == fs::canonicalize(source).ok()) {
            if policy == "overwrite" { return Err("A imagem original não pode ser substituída.".into()); }
        }
    }
    let parent = destination.parent().ok_or("Pasta de destino inválida.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    if policy == "overwrite" { fs::write(destination, contents).map_err(|e| e.to_string())?; return Ok(Some(destination.into())); }
    let mut candidate = destination.to_path_buf();
    for index in 2..100_002 {
        match fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(contents) { drop(file); let _ = fs::remove_file(&candidate); return Err(error.to_string()); }
                return Ok(Some(candidate));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => match policy {
                "skip" => return Ok(None),
                "rename" => {
                    let stem = destination.file_stem().unwrap_or_default().to_string_lossy();
                    let extension = destination.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
                    candidate = parent.join(format!("{stem}-{index}{extension}"));
                }
                _ => return Err(format!("FILE_EXISTS:{}", destination.display())),
            },
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Não foi possível encontrar um nome livre.".into())
}

#[tauri::command]
fn save_compressed_image(request: Request<'_>) -> Result<Option<String>, String> {
    let file_name = decoded_header(&request, "x-file-name")?;
    if Path::new(&file_name).file_name() != Some(OsStr::new(&file_name)) { return Err("Nome de arquivo de saída inválido.".into()); }
    let InvokeBody::Raw(contents) = request.body() else { return Err("Dados inválidos.".into()); };
    let source = request.headers().get("x-source-path").map(|_| decoded_header(&request, "x-source-path").map(PathBuf::from)).transpose()?;
    let destination = if request.headers().contains_key("x-destination-path") {
        PathBuf::from(decoded_header(&request, "x-destination-path")?)
    } else { source.as_ref().and_then(|p| p.parent()).ok_or("Pasta de origem ausente.")?.join(&file_name) };
    let policy = decoded_header(&request, "x-conflict-policy").unwrap_or_else(|_| "ask".into());
    save_with_policy(&destination, source.as_deref(), contents, &policy).map(|p| p.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn list_image_paths(directory: PathBuf) -> Result<Vec<PathBuf>, String> {
    fn visit(directory: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_dir() { visit(&entry.path(), output)?; }
            else if kind.is_file() && entry.path().extension().is_some_and(|ext| matches!(ext.to_string_lossy().to_lowercase().as_str(), "jpg" | "jpeg" | "png" | "webp" | "avif")) { output.push(entry.path()); }
        }
        Ok(())
    }
    let mut paths = Vec::new(); visit(&directory, &mut paths)?; paths.sort(); Ok(paths)
}

#[tauri::command]
fn open_output_folder(path: PathBuf) -> Result<(), String> {
    let directory = if path.is_dir() { path } else { path.parent().ok_or("Pasta inválida.")?.to_path_buf() };
    if !directory.is_dir() { return Err("Pasta não encontrada.".into()); }
    let program = if cfg!(target_os = "windows") { "explorer" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(program).arg(directory).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_image,
            read_image_dimensions,
            compress_image,
            save_compressed_image,
            list_image_paths,
            open_output_folder
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Compact Img");
}

#[cfg(test)]
mod tests {
    use super::{
        compress_image_blocking, encode_native_compression_payload, get_target_dimensions, write_compressed_image,
        write_compressed_image_to_path, CompressionSettings, ImageDimensions, JpegCompressionMode,
        OutputFormat,
    };
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

    #[test]
    fn encodes_native_compression_payload_with_dimension_header() {
        let payload = encode_native_compression_payload(
            vec![0xff, 0xd8, 0xff],
            ImageDimensions {
                width: 4000,
                height: 3000,
            },
            ImageDimensions {
                width: 1920,
                height: 1440,
            },
        );
        let header_end = payload
            .iter()
            .position(|byte| *byte == b'\n')
            .expect("cabecalho ausente");

        assert_eq!(&payload[..header_end], b"4000,3000,1920,1440");
        assert_eq!(&payload[header_end + 1..], &[0xff, 0xd8, 0xff]);
    }

    #[test]
    fn target_dimensions_preserve_or_limit_without_upscaling() {
        let mut settings = CompressionSettings {
            output_format: OutputFormat::Jpeg,
            preserve_original_dimensions: false,
            max_width: 100,
            max_height: 100,
            quality: 80,
            jpeg_compression_mode: JpegCompressionMode::Balanced,
            keep_aspect_ratio: true,
            strip_metadata: true,
            compression_mode: None,
            max_file_size_k_b: None,
            jpeg_background_color: None,
        };
        let dimensions = get_target_dimensions(400, 200, &settings);
        assert_eq!((dimensions.width, dimensions.height), (100, 50));

        settings.keep_aspect_ratio = false;
        let dimensions = get_target_dimensions(40, 200, &settings);
        assert_eq!((dimensions.width, dimensions.height), (40, 100));

        settings.preserve_original_dimensions = true;
        let dimensions = get_target_dimensions(400, 200, &settings);
        assert_eq!((dimensions.width, dimensions.height), (400, 200));
    }

    #[test]
    fn rejects_mismatched_custom_destination_name() {
        let destination = temporary_directory().join("output.webp");
        assert!(write_compressed_image_to_path(&destination, "other.webp", b"image").is_err());
        assert!(!destination.exists());
    }

    fn settings_for(output_format: OutputFormat, mode: JpegCompressionMode) -> CompressionSettings {
        CompressionSettings {
            output_format,
            preserve_original_dimensions: false,
            max_width: 64,
            max_height: 64,
            quality: 80,
            jpeg_compression_mode: mode,
            keep_aspect_ratio: true,
            strip_metadata: true,
            compression_mode: None,
            max_file_size_k_b: None,
            jpeg_background_color: None,
        }
    }

    fn write_test_png(directory: &std::path::Path, with_alpha: bool) -> std::path::PathBuf {
        let path = directory.join(if with_alpha { "alpha.png" } else { "opaque.png" });
        if with_alpha {
            image::RgbaImage::from_fn(200, 100, |x, y| image::Rgba([x as u8, y as u8, 90, (x % 256) as u8]))
                .save(&path)
                .expect("nao foi possivel criar a imagem de teste");
        } else {
            image::RgbImage::from_fn(200, 100, |x, y| image::Rgb([x as u8, y as u8, 90]))
                .save(&path)
                .expect("nao foi possivel criar a imagem de teste");
        }
        path
    }

    fn compressed_bytes(source: &std::path::Path, settings: CompressionSettings) -> (String, Vec<u8>) {
        let payload = compress_image_blocking(source.to_path_buf(), settings).expect("falha ao compactar");
        let header_end = payload.iter().position(|byte| *byte == b'\n').expect("cabecalho ausente");
        (
            String::from_utf8(payload[..header_end].to_vec()).unwrap(),
            payload[header_end + 1..].to_vec(),
        )
    }

    #[test]
    fn encodes_every_output_format_with_the_right_signature() {
        let directory = temporary_directory();
        fs::create_dir_all(&directory).unwrap();

        for with_alpha in [false, true] {
            let source = write_test_png(&directory, with_alpha);

            let (header, jpeg) = compressed_bytes(&source, settings_for(OutputFormat::Jpeg, JpegCompressionMode::Max));
            assert_eq!(header, "200,100,64,32");
            assert_eq!(&jpeg[..3], &[0xff, 0xd8, 0xff]);

            let (_, webp) = compressed_bytes(&source, settings_for(OutputFormat::Webp, JpegCompressionMode::Max));
            assert_eq!(&webp[..4], b"RIFF");
            assert_eq!(&webp[8..12], b"WEBP");

            let (_, png) = compressed_bytes(&source, settings_for(OutputFormat::Png, JpegCompressionMode::Max));
            assert_eq!(&png[..4], &[0x89, b'P', b'N', b'G']);

            let (_, avif) = compressed_bytes(&source, settings_for(OutputFormat::Avif, JpegCompressionMode::Max));
            assert_eq!(&avif[4..12], b"ftypavif");
        }

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn does_not_upscale_small_images() {
        let directory = temporary_directory();
        fs::create_dir_all(&directory).unwrap();
        let source = write_test_png(&directory, false);
        let mut settings = settings_for(OutputFormat::Jpeg, JpegCompressionMode::Fast);
        settings.max_width = 4000;
        settings.max_height = 4000;

        let (header, _) = compressed_bytes(&source, settings);
        assert_eq!(header, "200,100,200,100");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn conflict_policies_and_original_protection() {
        let directory = temporary_directory(); fs::create_dir_all(&directory).unwrap();
        let source = directory.join("original.png"); fs::write(&source, b"original").unwrap();
        let destination = directory.join("out.webp"); fs::write(&destination, b"old").unwrap();
        assert!(super::save_with_policy(&destination, Some(&source), b"new", "ask").unwrap_err().starts_with("FILE_EXISTS:"));
        assert!(super::save_with_policy(&destination, Some(&source), b"new", "skip").unwrap().is_none());
        assert_eq!(fs::read(&destination).unwrap(), b"old");
        let renamed = super::save_with_policy(&destination, Some(&source), b"new", "rename").unwrap().unwrap();
        assert_eq!(renamed.file_name().unwrap(), "out-2.webp");
        assert_eq!(fs::read(&renamed).unwrap(), b"new");
        super::save_with_policy(&destination, Some(&source), b"new", "overwrite").unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"new");
        assert!(super::save_with_policy(&source, Some(&source), b"new", "overwrite").is_err());
        assert!(super::save_with_policy(&source, Some(&source), b"new", "ask").unwrap_err().starts_with("FILE_EXISTS:"));
        assert!(super::save_with_policy(&source, Some(&source), b"new", "skip").unwrap().is_none());
        let copy = super::save_with_policy(&source, Some(&source), b"new", "rename").unwrap().unwrap();
        assert_eq!(copy.file_name().unwrap(), "original-2.png");
        assert_eq!(fs::read(&source).unwrap(), b"original");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn maximum_weight_on_real_encoders() {
        let directory = temporary_directory(); fs::create_dir_all(&directory).unwrap();
        let source = directory.join("noise.png");
        let mut rng = 123456u32;
        let image = image::RgbImage::from_fn(300, 200, |_, _| {
            let mut pixel = [0u8; 3]; for channel in &mut pixel { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; *channel = rng as u8; } image::Rgb(pixel)
        });
        image.save(&source).unwrap();
        for format in [OutputFormat::Jpeg, OutputFormat::Webp, OutputFormat::Png, OutputFormat::Avif] {
            let mut settings = settings_for(format, JpegCompressionMode::Balanced);
            settings.max_width = 300; settings.max_height = 200;
            settings.compression_mode = Some("target-size".into()); settings.max_file_size_k_b = Some(4);
            let (_, bytes) = compressed_bytes(&source, settings.clone()); assert!(bytes.len() <= 4096, "{} bytes", bytes.len());
            if matches!(format, OutputFormat::Png) {
                settings.preserve_original_dimensions = true;
                assert!(compress_image_blocking(source.clone(), settings).is_err());
            }
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn jpeg_uses_selected_background() {
        let pixels = super::PixelBuffer { width: 1, height: 1, has_alpha: true, data: vec![255, 200, 100, 0] };
        assert_eq!(super::flatten_to_rgb(&pixels, [12, 34, 56]), vec![12, 34, 56]);
    }

    #[test]
    fn removing_exif_preserves_jpeg_color_profile() {
        let settings = settings_for(OutputFormat::Jpeg, JpegCompressionMode::Balanced);
        let exif = b"PRIVATE_EXIF_TEST".to_vec();
        let icc = b"COLOR_PROFILE_TEST".to_vec();
        let bytes = super::encode_jpeg(&[128; 12], 2, 2, &settings, Some(exif.clone()), Some(icc.clone())).unwrap();
        assert!(!bytes.windows(exif.len()).any(|chunk| chunk == exif));
        assert!(bytes.windows(icc.len()).any(|chunk| chunk == icc));
        let directory = temporary_directory(); fs::create_dir_all(&directory).unwrap();
        let source = directory.join("profile.jpg"); fs::write(&source, bytes).unwrap();
        let (_, decoded_exif, decoded_icc) = super::load_image(&source, true).unwrap();
        assert!(decoded_exif.is_none()); assert_eq!(decoded_icc, Some(icc));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    #[ignore]
    fn bench_compress() {
        use std::time::Instant;
        let path = std::env::var("BENCH_IMAGE").expect("BENCH_IMAGE");
        let mut settings = settings_for(OutputFormat::Jpeg, JpegCompressionMode::Max);
        settings.max_width = 2000;
        settings.max_height = 2000;
        for _ in 0..3 {
            let start = Instant::now();
            let (_, out) = compressed_bytes(std::path::Path::new(&path), settings.clone());
            eprintln!("BENCH total={:?} out={}", start.elapsed(), out.len());
        }
    }

    #[test]
    #[ignore]
    fn bench_parallel_batch() {
        use std::{sync::Arc, time::Instant};
        let path = Arc::new(std::env::var("BENCH_IMAGE").expect("BENCH_IMAGE"));
        let mut settings = settings_for(OutputFormat::Jpeg, JpegCompressionMode::Max);
        settings.max_width = 2000;
        settings.max_height = 2000;
        for workers in [1usize, 2, 4] {
            let start = Instant::now();
            let handles: Vec<_> = (0..workers)
                .map(|_| {
                    let path = path.clone();
                    let settings = settings.clone();
                    std::thread::spawn(move || {
                        for _ in 0..(8 / workers) {
                            compressed_bytes(std::path::Path::new(path.as_str()), settings.clone());
                        }
                    })
                })
                .collect();
            handles.into_iter().for_each(|handle| handle.join().unwrap());
            eprintln!("BENCH 8 images with {workers} workers: {:?}", start.elapsed());
        }
    }
}
