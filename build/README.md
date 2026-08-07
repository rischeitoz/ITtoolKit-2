# Carpeta de Iconos y Build para HCPToolKit

En esta carpeta se encuentra el icono oficial en formato `.ico` que utiliza **Electron** y **electron-builder** para generar el ejecutable (`.exe`) de **HCPToolKit**:

- **`build/icon.ico`**: Es el archivo utilizado para:
  1. El icono del ejecutable de Windows (`HCPToolKit.exe`).
  2. El icono de la ventana principal y de la barra de tareas al abrir el `.exe`.

Si deseas cambiar el icono por uno personalizado:
1. Reemplaza el archivo `build/icon.ico` por tu propia imagen `.ico`.
2. Al ejecutar `npm run dist`, `electron-builder` empaquetará el `.exe` con tu nuevo icono automáticamente.
