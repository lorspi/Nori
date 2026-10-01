# Changelog

## [1.0.0] — 2026-10-01

### Added

- **Copiar, cortar y pegar capas**
  Ctrl + C copia las capas seleccionadas, Ctrl + X las corta y Ctrl + V las pega encima de la selección (o encima de todas si no hay ninguna), con su animación y en la misma posición. Ctrl + Shift + V pega las capas sin animación: sin fotogramas clave y con el aspecto que tenían en el cursor de tiempo cuando se copiaron. Las capas se copian al portapapeles del sistema, así que también se pueden pegar en otra pestaña o en otro proyecto. Si una capa duraba todo el proyecto de origen, dura todo el proyecto de destino, y si su nombre ya existe se le añade "Copia". Pegar se deshace en un solo paso.

- **Menú contextual del lienzo**
  El clic derecho sobre el lienzo abre un menú con Copiar, Cortar, Pegar, Pegar sin animación, Animaciones predeterminadas y Eliminar. Si la capa bajo el cursor no estaba seleccionada, se selecciona antes de abrir el menú; sobre una capa de la selección, se mantiene la selección múltiple.

- **Pegar SVG como capas**
  Al pegar código SVG (Ctrl + V o desde el menú del lienzo), cada forma se añade como una capa nueva del proyecto abierto, en lugar de abrir un proyecto nuevo. El SVG se centra en el lienzo y, si es más grande, se reduce para que quepa. Los SVG animados traen su animación; con "Pegar sin animación" se pegan quietos.

- **Detección del contenido del portapapeles**
  Al abrir el menú del lienzo, Nori comprueba qué hay en el portapapeles: Pegar y Pegar sin animación solo se activan si hay capas de Nori o código SVG. Mientras se comprueba, la opción muestra "Pegar (comprobando…)". La primera vez el navegador puede pedir permiso para leer el portapapeles; en los navegadores que no permiten leerlo sin preguntar (Firefox, Safari), las opciones quedan activas y se comprueba al pegar.

- **Importar desde Figma**
  El menú Abrir tiene la opción "Importar desde Figma". La ventana explica los pasos: seleccionar el frame en Figma, copiarlo con clic derecho › Copiar/Pegar como › Copiar como SVG y pulsar Importar (o Ctrl + V) en Nori. Se crea un proyecto nuevo con el tamaño del frame, el color de fondo del frame como fondo del lienzo y una capa por cada forma. Si se copió el frame con un Ctrl + C normal, Nori avisa de que Figma usa un formato propio y pide usar "Copiar como SVG". Como al abrir cualquier proyecto, si hay cambios sin guardar primero se pide confirmación.

- **Animaciones predeterminadas**
  El menú contextual de la línea del tiempo (y el del lienzo) tiene la opción "Animaciones predeterminadas…", que abre una ventana con cuatro pestañas: Entrada, Salida, Entrada y salida, y Movimiento. Cada animación tiene un nombre y una vista previa que se reproduce al pasar el ratón por encima. Al hacer clic, sus fotogramas clave se añaden a la capa (o a todas las capas seleccionadas) y quedan seleccionados en la línea del tiempo. La animación parte de los valores propios de la capa (posición, escala, rotación, opacidad y desenfoque), así que funciona en cualquier capa y siempre termina o empieza donde está la capa. Se elige la duración (de 0.3 s a 2 s) y el pie de la ventana muestra en qué tramo se añadirá. Las entradas, salidas y movimientos empiezan en el cursor de tiempo; "Entrada y salida" entra en el cursor de tiempo y sale al final de la línea del tiempo. Si no caben, se adelantan para terminar dentro del proyecto. Los fotogramas clave de los mismos parámetros que hubiera dentro de ese tramo se reemplazan. Se deshace en un solo paso.
  - Entrada: Aparecer, Desde la izquierda, Desde la derecha, Desde abajo, Desde arriba, Ampliar, Encoger, Pop, Elástico, Caer con rebote, Girar, Enfocar y Desplegar.
  - Salida: Desvanecer, Hacia la izquierda, Hacia la derecha, Hacia arriba, Hacia abajo, Reducir, Ampliar y desvanecer, Hundir, Caer, Girar y salir, Desenfocar y Plegar.
  - Entrada y salida: Aparecer y desvanecer, De izquierda a derecha, De derecha a izquierda, De abajo hacia arriba, De arriba hacia abajo, Ampliar y reducir, Pop, Elástico, Caer con rebote, Girar, Enfocar y desenfocar, y Desplegar y plegar.
  - Movimiento: Pulso, Latido, Sacudir, Tambalear, Flotar, Saltar, Giro de 360°, Parpadear, Gelatina y Tada.

### Changed

- **Copiar fotogramas clave**
  Ctrl + C copia los fotogramas clave seleccionados cuando el último clic fue en la línea del tiempo (o si no hay capas seleccionadas); si no, copia las capas. Los fotogramas clave y las animaciones de capa copiados también pasan al portapapeles del sistema, para pegarlos en otra pestaña.

### Fixed

- **Rastro al mover capas sobre un fondo transparente**
  Con el fondo del proyecto transparente y la opción Transparencia de la barra superior desactivada, el lienzo no se borraba entre fotogramas: al mover o animar una capa quedaba un rastro de todas sus posiciones anteriores. Ahora el lienzo se limpia en cada fotograma, también en las exportaciones de video y GIF.

## [0.4.0] — 2026-10-01

### Added

- **Guardar con Ctrl + S**
  Ctrl + S (Cmd + S en Mac) descarga el proyecto como JSON, igual que el botón Guardar, en lugar de abrir el diálogo "Guardar página" del navegador. Funciona también mientras se escribe en un campo.

- **Mover capas con las flechas del teclado**
  Las flechas mueven las capas seleccionadas 1 px, o 10 px con Shift. Si la posición está animada, el cambio se guarda como fotograma clave en el tiempo actual. Las capas bloqueadas u ocultas no se mueven, y mantener una flecha pulsada se deshace en un solo paso.

- **Navegar por fotogramas clave**
  Los controles de la línea del tiempo tienen dos botones nuevos, "Ir al fotograma clave anterior" e "Ir al fotograma clave siguiente", que saltan al fotograma clave más cercano de cualquier capa.

- **Proyecto de ejemplo**
  El menú Abrir tiene la opción "Proyecto de ejemplo", que abre la animación del logo de Nori que se muestra en la primera visita y la reproduce. Si hay cambios sin guardar, primero se pide confirmación, como al abrir cualquier otro proyecto.

- **Vista previa del SVG en vivo**
  Al elegir SVG en la ventana de exportar, la animación se muestra al momento, sin renderizar, y se actualiza con el color de fondo, la transparencia y los FPS. El botón Descargar está disponible de inmediato.

### Changed

- **Atajos de la línea del tiempo con F y G**
  F retrocede y G avanza: solos, un fotograma; con Ctrl, al fotograma clave anterior o siguiente; con Shift, al inicio o al final de la línea del tiempo. Las flechas izquierda y derecha ya no mueven el cursor de tiempo, porque ahora mueven las capas seleccionadas.

- **Tooltips propios**
  Todos los tooltips de Nori usan un diseño propio en lugar del del navegador: una etiqueta oscura bajo el elemento que aparece tras una breve pausa y, al pasar a un botón vecino, cambia sin esperar. Los que tienen atajo lo muestran con teclas, por ejemplo [Ctrl] [G]. En Mac, Ctrl se muestra como ⌘.

- **Ventana Exportar Animación**
  - La vista previa del render se muestra a la derecha de los ajustes, y no debajo. A la izquierda, los formatos ocupan dos filas y Resolución y Velocidad (FPS) tienen cada uno su propia línea.
  - Cada formato conserva su render al cambiar a otro formato (y al cerrar y volver a abrir la ventana). Un punto verde marca los formatos que ya tienen render, y el botón de la papelera lo borra para repetirlo. Si el proyecto cambió después del render, se avisa bajo la vista previa.
  - Mientras un render está en curso se puede ver otro formato; el render sigue y su resultado se guarda en su formato.
  - Resolución y Velocidad usan el mismo menú desplegable que el resto del editor. En SVG, Resolución queda desactivada porque el vector no depende de ella.
  - El color de fondo se elige con la misma muestra de color y campo hexadecimal del panel derecho.
  - Se quitó la opción JSON: el proyecto se guarda con el botón Guardar o con Ctrl + S.

- **Ayuda de atajos del lienzo plegable**
  La barra de atajos de la esquina inferior izquierda del lienzo ("Espacio + Arrastrar: Desplazar · Ctrl + Rueda: Zoom · Shift + Clic: Selección múltiple") se cierra con su botón X y queda como un pequeño botón "?" que la vuelve a mostrar. Nori recuerda en el navegador si estaba abierta o cerrada.

- **Menús desplegables unificados**
  Los selectores que usaban el desplegable nativo del navegador (FPS en los ajustes del proyecto y Grosor de los textos) usan ahora el mismo componente que la curva de suavizado, el zoom y la ventana de exportar: se cierran al hacer clic fuera o con Esc y marcan la opción elegida con un check.

### Fixed

- **Deshacer un cambio de color**
  Al elegir un color con el selector, el navegador envía un cambio por cada movimiento dentro del selector, y cada uno se guardaba como un paso del historial, así que deshacer recorría el color poco a poco. Ahora cada elección de color completa se deshace en un solo paso, en el relleno, el trazo y el fondo del lienzo. Escribir un valor hexadecimal también cuenta como un solo paso por cada vez que se edita el campo.

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