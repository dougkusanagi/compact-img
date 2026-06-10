use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};
use tauri::ipc::{InvokeBody, Request, Response};

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

#[tauri::command]
fn save_compressed_image(request: Request<'_>) -> Result<String, String> {
    let source_path = PathBuf::from(decoded_header(&request, "x-source-path")?);
    let file_name = decoded_header(&request, "x-file-name")?;
    let InvokeBody::Raw(contents) = request.body() else {
        return Err("Os dados da imagem compactada sao invalidos.".into());
    };

    let destination = write_compressed_image(&source_path, &file_name, contents)?;
    Ok(destination.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_image, save_compressed_image])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Compact Img");
}

#[cfg(test)]
mod tests {
    use super::write_compressed_image;
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
}
