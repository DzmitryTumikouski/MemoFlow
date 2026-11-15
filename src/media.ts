import { File, Paths } from 'expo-file-system';
import { uid } from './storage';

// Берёт расширение файла из пути (jpg, png, m4a...), иначе — запасное
export function extOf(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : fallback;
}

// Фото из галереи и записи лежат во временной папке, и система может их стереть.
// Эта функция копирует файл в постоянную папку приложения.
// Если что-то пошло не так — просто возвращает старый путь, ничего не ломается.
export function persistMedia(uri: string, ext: string): string {
  try {
    const dest = new File(Paths.document, `${uid()}.${ext}`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}
