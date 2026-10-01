# Changelog

## [0.3.0] — 2026-09-30

### Added

- **Animación de vértices (forma del vector)**
  El nuevo parámetro "Forma (vértices)" anima la silueta de un trazado moviendo sus vértices. En el apartado Forma del inspector, "Editar vértices" (o doble clic sobre el trazado en el lienzo) muestra un punto en cada vértice; al arrastrarlo, las asas de las curvas conectadas se mueven con él para conservar la forma. Se pueden seleccionar varios vértices con un recuadro o con Shift + clic (Shift + clic sobre uno seleccionado lo quita de la selección); al arrastrar cualquiera de ellos se mueven todos, y las flechas del teclado los desplazan 1 px (10 px con Shift). Cada arrastre o pulsación de flecha se deshace en un solo paso. Con el rombo activado, cada fotograma clave guarda la posición de los vértices y Nori interpola la forma entre ellos con la curva de suavizado elegida. Esc, Enter o un clic fuera de la forma (sin arrastrar) terminan la edición. Las formas básicas se convierten primero en trazado con "Convertir en trazado y editar vértices", que conserva su aspecto, incluidas las esquinas redondeadas. En la exportación SVG, la animación de la forma se escribe como animación CSS del trazado.

- **Desenfoque gaussiano**
  El nuevo apartado Efectos del inspector añade un desenfoque gaussiano a cualquier capa, en píxeles y animable con su rombo. Se ve igual en el lienzo y en las exportaciones de video y GIF, escala con la capa, y en el SVG se exporta como `filter: blur()`.

- **Esquinas redondeadas**
  Rectángulos, triángulos, polígonos y estrellas tienen un campo "Radio" en el nuevo apartado Forma, animable con su rombo. El radio se limita para que las esquinas vecinas nunca se monten.

- **Trazo de las formas**
  En "Relleno y trazo" se elige el color y el grosor del trazo de la forma, que también se animan. Tanto el relleno como el trazo se quitan con el botón "−" y se recuperan con "+", que restaura el último color usado. Los cambios se aplican a todas las capas seleccionadas.

- **Nuevas formas: triángulo y polígono**
  El menú de formas ofrece Rectángulo, Elipse, Triángulo, Polígono y Estrella. El polígono permite elegir de 3 a 12 lados, y la estrella, el número de puntas y el tamaño del radio interior. Triángulos y polígonos ocupan todo el recuadro de la capa.

- **Puntos de control arrastrables en la gráfica de la curva**
  Los puntos azules de la gráfica ahora modifican la curva al arrastrarlos. Cada curva muestra solo los puntos que tienen sentido: ninguno en Linear, uno en Ease in y Ease out, dos en Ease in-out, Back in, Back out y en las curvas Bézier personalizadas. En Spring, el punto marca el primer rebote: su altura ajusta cuánto se pasa del final y su posición, la velocidad de la oscilación (la rigidez y la fricción se recalculan solas). En Bounce, la altura del punto ajusta la elasticidad y su posición elige el número de rebotes. La escala de la gráfica se adapta a la curva, para que los rebotes y las anticipaciones nunca queden fuera, y se mantiene fija mientras se arrastra. Cada arrastre se deshace en un solo paso.

- **Curva "Personalizada"**
  Al editar cualquier parámetro de una curva (arrastrando un punto, escribiendo un valor o arrastrando la etiqueta de un campo), la curva pasa a "Personalizada" y la curva base conserva sus valores predeterminados. Elegir de nuevo una curva de la lista restablece sus valores originales; elegir "Personalizada" crea una copia editable de la curva actual.

- **Nuevas curvas: Ease in, Ease out, Back in y Back out**
  Ease in arranca lento y acelera, Ease out arranca rápido y frena, Back in toma impulso hacia atrás antes de avanzar y Back out se pasa del valor final y regresa.

- **Parámetros de Bounce**
  La curva Bounce ahora tiene campos para el número de rebotes (1 a 8) y la elasticidad. Con los valores predeterminados, la curva es idéntica a la anterior.

- **Equivalente CSS de las curvas Bézier**
  Debajo de los campos X1, Y1, X2 e Y2 se muestra la curva como `cubic-bezier(…)`, lista para copiar. Los campos también se ajustan arrastrando su etiqueta.

### Changed

- **Herramientas de la barra superior**
  Se quitaron la herramienta de texto y la forma Cápsula. Los proyectos que ya las usan, y los textos de los SVG importados, se siguen mostrando y exportando igual.

- **Rectángulo sin esquinas redondeadas**
  Las formas nuevas se crean con esquinas rectas, relleno azul y sin trazo.

- **Animación entre un color y "sin color"**
  Al animar un relleno o un trazo desde o hacia "sin color", el color se desvanece manteniendo su tono, en lugar de pasar por negro o cambiar de golpe.

- **Selector de curva como menú desplegable**
  El selector de la curva de suavizado es un menú desplegable, con el mismo componente que el selector de zoom. Cada opción muestra una miniatura de la curva y el orden es: Linear, Ease in, Ease out, Ease in-out, Back in, Back out, Bounce, Spring y Personalizada.

- **Linear como curva predeterminada**
  Los fotogramas clave nuevos usan la curva Linear en lugar de Spring.

- **Botón Test con previsualización real**
  Test reproduce la animación al ritmo de la curva y con la duración real del tramo seleccionado (del fotograma clave al siguiente). Un objeto se desplaza en una pista bajo la gráfica, incluidos los rebotes y las anticipaciones, mientras un punto verde recorre la curva. Durante la reproducción, el botón cambia a Stop.

- **Menú de zoom**
  El menú de zoom ahora se cierra al hacer clic fuera de él o al pulsar Esc.

### Fixed

- **Muestra de color completa**
  La muestra de color del relleno, del trazo y del fondo del lienzo se rellena entera, sin el margen que dejaba el selector nativo. Los colores con transparencia se ven sobre un patrón de cuadros, y "sin color" se indica con una diagonal roja.

- **Animación de parámetros sin valor inicial**
  Un parámetro animado que la capa todavía no tenía guardado, como el punto de anclaje o el desenfoque, ahora se anima correctamente.

- **Gráficas de Bounce y Spring sin picos**
  La gráfica de Bounce se dibuja con arcos parabólicos exactos y la de Spring con muchas más muestras, así que ambas se ven curvas y suaves en lugar de formar picos entre puntos.

- **Final de los resortes suaves**
  Un resorte con poca fricción que seguía oscilando al final del tramo saltaba de golpe al valor final en el último fotograma. Ahora la oscilación restante se desvanece suavemente en el último 20 % del tramo. Los resortes que ya se asentaban antes, como el predeterminado, no cambian.

## [0.2.0] — 2026-09-30

### Added

- **Despliegue con un solo comando**
  El script `npm run deploy` compila la aplicación y la publica en Cloudflare Pages. El nuevo archivo `wrangler.jsonc` define el proyecto (`nori`) y la carpeta del build (`./dist`), por lo que `wrangler pages deploy` ya no requiere indicar el directorio. Desde la rama `main` se publica en producción; desde cualquier otra rama se crea un despliegue de vista previa con su propia URL.

- **Ajuste de valores arrastrando la etiqueta del campo**
  Como en Figma, los valores numéricos del inspector se modifican arrastrando a los lados sobre la etiqueta del campo (X, Y, Ax, Ay, W, H, ∡, Op, Tamaño, rigidez, fricción y masa del resorte, y ancho, alto y duración del proyecto): hacia la derecha el valor aumenta y hacia la izquierda disminuye. Al pasar el cursor por la etiqueta aparece el cursor de flechas horizontales, Shift multiplica la velocidad por 10 y cada arrastre se deshace en un solo paso.

- **Renombrar capas desde el inspector**
  El nombre de la capa en el encabezado del panel derecho se edita en el mismo lugar, igual que el del proyecto: clic para escribir, Enter para guardar y Esc para cancelar.

### Changed

- **Campos numéricos sin flechas incrementales**
  Los campos numéricos ya no muestran las flechas de incremento del navegador; el valor se escribe directamente o se ajusta arrastrando su etiqueta.

- **Acciones de archivo en la barra superior**
  La barra superior agrupa tres iconos: Nuevo proyecto, Abrir y Guardar. Abrir despliega las opciones "Abrir JSON / Lottie", "Importar SVG" (desde un archivo) y "Pegar SVG" (desde el portapapeles).

- **Notificaciones de deshacer y rehacer**
  Deshacer y rehacer ya no muestran una notificación en cada paso. Solo se avisa, una vez por sesión, cuando se intenta deshacer sin más historial disponible.

### Fixed

- **Color de relleno con varias capas seleccionadas**
  Al cambiar el color con varias capas seleccionadas, el cambio se aplica a todas ellas y no solo a la capa mostrada en el inspector.

## [0.1.1] — 2026-09-30

### Added

- **Publicación en Cloudflare Pages con dominio propio**
  Nori está disponible en [nori.lorspi.com](https://nori.lorspi.com), servido desde Cloudflare Pages con HTTPS y redirección automática de HTTP a HTTPS.

- **Analítica opcional con Microsoft Clarity**
  Clarity se carga solo cuando el ID del proyecto y el dominio permitido están definidos en un archivo `.env` local (`VITE_CLARITY_ID` y `VITE_CLARITY_HOST`) y la aplicación se abre desde ese dominio. Así, las copias del repositorio y el entorno de desarrollo no envían datos a las estadísticas del proyecto original. El archivo `.env.example` documenta las variables.

### Changed

- **Vista previa al compartir enlaces**
  Las etiquetas Open Graph y Twitter Card usan URLs absolutas para la imagen de vista previa, y se añadieron `og:url` y la URL canónica, de modo que redes sociales y buscadores muestran correctamente el enlace a Nori.

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