# Changelog

## [0.1.0] — 2026-09-30

### Added

- **Editor de animación vectorial en el navegador**
  Lienzo interactivo con zoom (Ctrl + rueda) y desplazamiento (Espacio + arrastrar o herramienta Mano), selección y transformación directa de capas, punto de anclaje editable y vista previa de transparencia con patrón de ajedrez. Todo el renderizado ocurre en el navegador mediante Canvas 2D, sin servidores externos.

- **Capas de formas y texto**
  Se pueden agregar rectángulos, cápsulas, círculos, estrellas y textos. Cada capa se puede duplicar, eliminar, ocultar y bloquear, y sus propiedades (posición, escala, rotación, opacidad, relleno, contenido y tipografía) se editan desde el inspector. En el lienzo, la capa seleccionada se escala arrastrando las esquinas del cuadro de selección (proporcional; Shift para escala libre) o sus aristas (solo en esa dimensión); el lado opuesto queda fijo, y con Alt se escala desde el punto de anclaje. Acercando el cursor por fuera de una esquina aparece el cursor de rotación para girar la capa alrededor de su punto de anclaje (Shift ajusta a pasos de 15°). Varias capas se seleccionan con Shift/Ctrl + clic o arrastrando un recuadro sobre el lienzo, y se mueven, escalan, rotan o eliminan juntas.

- **Línea de tiempo con fotogramas clave**
  Reproducción en bucle, avance cuadro a cuadro y cabezal arrastrable. La animación de cada parámetro (posición, punto de anclaje, escala, rotación, opacidad y relleno) se activa desde el icono de fotograma clave del inspector, que pasa de gris a azul; solo los parámetros animados aparecen en la línea de tiempo. Con la animación activa, modificar la capa en el lienzo o en el inspector crea o actualiza el fotograma clave del cuadro actual. Los fotogramas clave se mueven arrastrándolos (ajustados a cuadros) y se eliminan con doble clic; la barra azul de cada capa abarca sus fotogramas clave y permite moverlos todos a la vez. Se pueden seleccionar varios fotogramas clave (Shift/Ctrl + clic o arrastrando un recuadro) para moverlos juntos o cambiar su curva de suavizado a la vez, y un menú contextual (clic derecho) permite copiar y pegar fotogramas clave o la animación completa de una capa en otra (también con Ctrl+C / Ctrl+V). El zoom de la línea de tiempo se ajusta con el control deslizante o con Ctrl + rueda, y su altura se cambia arrastrando el borde superior (doble clic para restablecerla).

- **Curvas de suavizado con vista previa en vivo**
  Cada fotograma clave admite los suavizados spring, Bézier, ease-in-out, bounce y lineal. El editor de curvas muestra la forma de la interpolación y permite probarla en vivo; los parámetros físicos (rigidez, fricción y masa) y los puntos de control Bézier se ajustan de forma numérica.

- **Importación de animaciones Lottie y proyectos JSON**
  Se pueden abrir archivos Lottie (`.json`) y proyectos propios desde el botón "Abrir JSON / Lottie" o arrastrándolos directamente sobre la ventana. Antes de reemplazar el proyecto actual, un diálogo ofrece guardar los cambios, continuar sin guardar o cancelar.

- **Importación de SVG**
  El menú "Importar SVG" abre un SVG como proyecto completo, ya sea desde un archivo (o arrastrándolo sobre la ventana) o pegando su código en un cuadro de texto ("Desde portapapeles"). El lienzo toma el tamaño del SVG y cada forma (rectángulos, círculos, elipses, líneas, polígonos, trazados y textos) se convierte en una capa con sus transformaciones, estilos CSS, opacidad y colores. Si el SVG está animado (SMIL o CSS `@keyframes`), sus animaciones se convierten en fotogramas clave en la línea del tiempo y el proyecto dura lo mismo que la animación; si no lo está, se importa completo sin animaciones.

- **Exportación a GIF, MP4, WebM, SVG y JSON**
  El diálogo de exportación permite elegir formato, resolución (de 0.5x a 4x), velocidad (24, 30 o 60 FPS) y fondo transparente o de color. Al terminar muestra una vista previa del archivo generado y su tamaño antes de descargarlo.

- **Renombrar el proyecto**
  El nombre del proyecto en la barra superior se edita en el mismo lugar: clic para escribir, Enter para guardar y Esc para cancelar.

- **Animación de bienvenida y último proyecto abierto**
  La primera vez que se abre Nori se reproduce una animación de ejemplo con el logotipo de Nori (el asterisco se despliega pétalo a pétalo y el nombre aparece letra a letra), que sirve también para explorar cómo está construida. El proyecto abierto se guarda automáticamente en el navegador, y al volver a abrir la aplicación se carga el último proyecto en el que se estaba trabajando.

- **Proyecto nuevo**
  El botón "Nuevo proyecto" de la barra superior crea un proyecto en blanco (tras ofrecer guardar los cambios del actual).

- **Deshacer y rehacer**
  Historial de hasta 30 pasos con Ctrl+Z, Ctrl+Y y Ctrl+Shift+Z. Los arrastres en el lienzo y en la línea de tiempo se registran como un único paso.

- **Identidad visual de la suite Kora / Tervo**
  Nori adopta el mismo sistema de diseño que las demás aplicaciones de la suite: tipografías Sen y JetBrains Mono, paleta de colores en variables HSL con tokens semánticos (`bg-card`, `text-muted-foreground`, acentos bento), radios y sombras de tarjeta, scrollbars personalizadas y los toasts compartidos del `UIProvider`, que reemplazan la notificación propia del editor.

- **Tema claro y oscuro**
  Nuevo botón en la barra superior para alternar entre tema claro y oscuro. La preferencia se guarda en `localStorage` (`nori-theme`) y, si no se ha elegido ninguna, se respeta la del sistema. Un script en `index.html` aplica el tema antes del primer pintado para evitar parpadeos.

- **Iconografía con Phosphor Icons (peso duotone)**
  Toda la interfaz usa `@phosphor-icons/react` con el peso duotone aplicado de forma global mediante un `IconContext.Provider`, igual que en Kora.

- **Sección "Acerca de Nori"**
  Accesible desde el botón de información de la barra superior. Incluye la filosofía del proyecto, información general, stack tecnológico, enlaces, licencia y una pestaña con el historial de cambios. También consulta el `version.txt` del repositorio en GitHub y, si hay una versión más reciente, muestra un enlace a la página de releases.

- **Instalación como aplicación (PWA)**
  Se agregó el `manifest.webmanifest` y un service worker con estrategia de caché mixta: la navegación y los assets de Vite se sirven desde la red con respaldo en caché para uso sin conexión, los recursos estáticos (iconos, logos, manifest) se sirven desde caché y `version.txt` siempre se consulta en la red. El service worker ignora peticiones que no sean `http`/`https` o de otros orígenes.

- **Sistema de versionado**
  La versión vive en `public/version.txt` y se incrusta en el bundle al compilar (`__APP_VERSION__`) mediante Vite `define`. El service worker incluye la versión en su `CACHE_NAME` (`nori-cache-0.1.0`) para invalidar la caché anterior en cada actualización.

- **Metadatos y Open Graph**
  Se agregaron descripción, etiquetas Open Graph y Twitter Card con imagen de vista previa, favicon, icono para dispositivos Apple y metadatos para instalación en escritorio y móvil.

### Changed

- **Renombrado a Nori**
  El proyecto pasó a llamarse Nori en toda la interfaz, los metadatos y los mensajes. Los proyectos guardados ahora usan la extensión `.nori.json` y los datos Lottie de las plantillas incluidas se identifican con Nori como generador.

- **Tipografía predeterminada de las capas de texto**
  Las capas de texto nuevas y las plantillas usan Sen en lugar de Plus Jakarta Sans, para que el texto del lienzo coincida con la tipografía cargada por la aplicación.
