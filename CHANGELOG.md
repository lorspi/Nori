# Changelog

## [1.3.0] — 2026-10-02

### Added

- **Operaciones booleanas**
  Dos o más formas seleccionadas se combinan en un grupo booleano con Unir, Restar, Intersectar o Excluir, desde el nuevo botón de la barra superior, el menú del clic derecho o con Alt + Shift + U, S, I o X, como en Figma. Restar quita las formas de delante a la que está más atrás. El grupo se dibuja como una sola forma y toma el relleno, el trazo y los efectos de la forma que estaba más atrás; después se cambian en el Inspector como en cualquier capa, también el trazo, que recorre el contorno del resultado. Con un grupo seleccionado, el mismo botón (o los mismos atajos) cambia su operación, y el Inspector muestra las cuatro operaciones para pasar de una a otra.

- **Las formas del grupo siguen siendo editables y animables**
  El grupo tiene su propia posición, anclaje, escala, rotación y opacidad, que se animan como en cualquier capa, y cada forma de dentro conserva su animación: si un círculo se mueve sobre un cuadrado, el hueco o la unión cambian en cada fotograma. Un clic selecciona el grupo y un doble clic, la forma que está bajo el cursor; desde ahí los clics eligen entre las formas del grupo, Esc vuelve a seleccionar el grupo y un clic fuera de él sale. Con el grupo seleccionado se ven los contornos de sus formas. En la línea del tiempo, las formas aparecen debajo del grupo, con sangría, y se muestran u ocultan con su triángulo. Un grupo puede contener otros grupos para combinar operaciones distintas.

- **Aplanar y desagrupar**
  "Aplanar" (Ctrl + E) convierte el grupo en un trazado con su forma en el fotograma actual; el trazado conserva la posición, el estilo y la animación del grupo. "Desagrupar" saca las formas del grupo, en el lugar donde se ven, con su propio relleno y trazo, y elimina el grupo. Los dos están en el Inspector, en el botón de la barra superior y en el menú del clic derecho.

- **Grupos booleanos en el SVG exportado**
  Un grupo cuyas formas no se mueven entre sí se exporta como un solo trazado, aunque el grupo entero esté animado: es lo más liviano y lo que mejor se abre en Figma, Illustrator o Inkscape. Si las formas se mueven entre sí, la ventana de exportar muestra la opción "Grupos booleanos animados": Máscaras (archivo liviano y movimiento fluido; el trazo del resultado se aproxima donde las formas se cruzan), Aplanar (un solo trazado que cambia en cada fotograma: exacto y fácil de abrir en editores, pero más pesado) o Automático, que usa máscaras para los grupos sin trazo y el trazado para los que tienen trazo. El trazado animado usa SMIL, que funciona en todos los navegadores, también en Safari.

- **Ordenar las capas arrastrándolas en la línea del tiempo**
  Una fila de la lista de capas se arrastra hacia arriba o hacia abajo para cambiar su orden: una línea azul marca si quedará antes o después de la fila sobre la que se suelta (más arriba en la lista es más atrás en el lienzo). Al soltarla sobre el centro de un grupo booleano, la capa entra en el grupo, delante de sus formas; arrastrar una forma fuera del grupo la saca de él. Así también se cambia el orden de las formas dentro del grupo, lo que decide, por ejemplo, de cuál se resta el resto. La capa queda en el mismo lugar del lienzo aunque cambie de grupo, se mueve con todo lo que contiene y el cambio se deshace en un paso. Un grupo que se queda sin formas desaparece.

### Changed

- **Copiar, duplicar y borrar incluyen las formas del grupo**
  Copiar, cortar, duplicar (también con Alt + arrastrar) o borrar un grupo booleano se lleva sus formas. Una forma copiada desde dentro de un grupo se pega donde se veía en el lienzo. Si se borran todas las formas de un grupo, el grupo también desaparece.

- **Nori sigue cargando igual de rápido**
  Las operaciones booleanas se calculan con paper.js, que conserva las curvas de las formas. Solo se descarga (unos 70 KB) la primera vez que se abre un proyecto con un grupo booleano; mientras tanto, el grupo se dibuja con su relleno y el trazo aparece en cuanto termina la carga.

### Fixed

- **Las capas desaparecían al alargar el proyecto**
  Al aumentar la duración del proyecto, las capas dejaban de verse después de la duración original, porque seguían terminando ahí. Ahora las capas que duraban hasta el final siguen durando hasta el nuevo final, y al acortar el proyecto ninguna pasa del final. Los proyectos guardados con este problema se reparan al abrirlos.

- **Punto de anclaje en el SVG exportado**
  Las capas con el punto de anclaje fuera del centro ahora giran y se escalan alrededor de él también en el SVG exportado, igual que en el lienzo. Antes giraban alrededor del centro de la forma.

## [1.2.1] — 2026-10-02

### Added

- **Carpetas de proyectos**
  Los proyectos se pueden agrupar en carpetas. Las carpetas aparecen en la barra lateral, debajo de Proyectos, con el número de proyectos que contienen y, al pasar el cursor, botones para renombrarlas o eliminarlas. En Inicio se muestran como tarjetas más bajas encima de la cuadrícula de proyectos. Un proyecto se mueve a una carpeta arrastrándolo sobre ella, ya sea la tarjeta o la carpeta de la barra lateral; para sacarlo se arrastra a "Proyectos" en la barra lateral o a "Inicio" en la parte de arriba, o se elige "Sacar de la carpeta" en su menú. Los proyectos que se crean o importan con una carpeta abierta se guardan en ella (también al arrastrar un archivo .json o .svg a la ventana), y al duplicar un proyecto la copia queda en la misma carpeta. Si se elimina una carpeta, sus proyectos pasan a la raíz de Inicio; no se borra ninguno.

- **Respaldo del espacio de trabajo**
  Una nueva sección, Respaldo, en la parte de abajo de la barra lateral (encima de Acerca de Nori), sirve para pasar todo el espacio de trabajo a otro navegador o equipo. "Crear respaldo" descarga un archivo .zip con todos los proyectos (también los de la papelera) y las carpetas; dentro, cada proyecto es un JSON de Nori que también se puede abrir por separado. "Cargar respaldo" lee ese archivo y deja elegir entre mantener lo que ya hay y añadir el contenido del respaldo (lo que ya estaba igual no se duplica) o reemplazar todo el espacio de trabajo, esto último con una confirmación previa. Si el navegador no tiene espacio suficiente, no se cambia nada. La página explica por qué conviene tener siempre un respaldo reciente, ya sea completo o descargando el JSON de cada proyecto, y muestra cuándo se creó el último respaldo en ese navegador.

- **Renombrar la carpeta desde su título**
  Dentro de una carpeta, su nombre en el título se puede editar con un clic, igual que el nombre del proyecto en el editor: Enter o salir del campo guarda el cambio y Escape lo descarta.

### Changed

- **Ruta completa en el editor**
  Si el proyecto está en una carpeta, la barra superior del editor muestra la ruta completa: Inicio / Carpeta / Proyecto. Un clic en la carpeta abre esa carpeta en Inicio.

- **Nori vuelve a la última pantalla**
  Al cargar o recargar la página se abre la pantalla en la que lo dejaste: el proyecto que estabas editando o Inicio, en la misma sección (Proyectos, una carpeta, Papelera, Respaldo o Acerca de Nori). La primera vez que se abre Nori sigue cargando el proyecto de ejemplo.

- **Botones de Inicio**
  "Nuevo proyecto" pasa a llamarse "Crear" y abre un menú con Proyecto en blanco, Proyecto de ejemplo y Carpeta; Proyecto de ejemplo deja de tener su propio botón. Importar SVG, Código SVG e Importar desde Figma se reúnen en un menú "Importar". Cada opción explica qué hace debajo de su nombre.

- **Orden de los proyectos**
  En Inicio y dentro de cada carpeta, los proyectos se ordenan por la fecha de su última edición, primero el más reciente. Las carpetas se ordenan por nombre.

## [1.2.0] — 2026-10-01

### Added

- **Varios proyectos guardados en el navegador**
  Nori ahora guarda todos tus proyectos, no solo el último. Cada cambio se guarda solo mientras editas, en el almacenamiento local (localStorage) del navegador. Al abrir Nori se carga el último proyecto que estabas editando; la primera vez se abre el proyecto de ejemplo. El proyecto que guardaban las versiones anteriores pasa automáticamente a la nueva lista.

- **Inicio**
  Una nueva pantalla reúne los proyectos guardados en una cuadrícula. Al pasar el cursor sobre un proyecto se reproduce su animación y con un clic se abre. Cada proyecto tiene un menú (clic derecho o el botón "…") con Abrir, Exportar, Descargar JSON, Renombrar, Duplicar y Borrar. Un aviso deja claro que los proyectos solo existen en este navegador y en este equipo; se puede cerrar, y desde entonces el mismo aviso aparece al pasar el cursor por el icono de información junto a Almacenamiento, en la barra lateral, que muestra el espacio que ocupan los proyectos.

- **Crear e importar desde Inicio**
  Las acciones del antiguo menú Abrir están ahora en una barra de botones de Inicio (cada uno explica qué hace al pasar el cursor): Nuevo proyecto, Abrir JSON / Lottie, Importar SVG, Código SVG, Importar desde Figma y Proyecto de ejemplo. Cada una crea un proyecto nuevo en la lista, sin reemplazar el que estaba abierto. Arrastrar un archivo .json o .svg a la ventana también crea un proyecto nuevo: en Inicio, al arrastrarlo aparece un recuadro que indica dónde soltarlo, y si el archivo no es compatible o está dañado se muestra un mensaje de error con el motivo.

- **Papelera de reciclaje**
  Los proyectos borrados van a la Papelera, desde donde se pueden restaurar o eliminar permanentemente, uno a uno o vaciándola entera.

- **Botón para descargar el proyecto**
  A la izquierda de Exportar, un botón con el icono de descarga guarda el proyecto como archivo JSON de Nori (también con Ctrl + S).

### Changed

- **Barra superior del editor**
  Delante del nombre del proyecto aparece "Inicio /", que lleva de vuelta a los proyectos guardados. Desaparecen los botones de nuevo proyecto, abrir y guardar, ya que los proyectos se guardan solos y se crean desde Inicio. El botón Exportar usa ahora el icono de video.

- **Acerca de Nori se mueve a Inicio**
  Acerca de Nori y el historial de cambios se abren desde la parte inferior de la barra lateral de Inicio, en lugar de desde el editor.

- **Sin aviso al cambiar de proyecto**
  Como cada proyecto se guarda solo, ya no aparece la ventana de "cambios no guardados" al abrir otro proyecto.

- **Título de la pestaña**
  La pestaña del navegador muestra el nombre del proyecto abierto.

## [1.1.1] — 2026-10-01

### Added

- **Seleccionar varias barras de animación**
  Shift o Ctrl + clic sobre una barra azul de la línea del tiempo la añade a la selección (o la quita, si ya estaba seleccionada). Al arrastrar cualquiera de las barras seleccionadas se mueven todas a la vez, y al arrastrar un extremo se estiran o encogen en conjunto desde el extremo opuesto del grupo, conservando la separación entre ellas. Un clic sin arrastrar sobre una barra de la selección deja seleccionada solo esa. Todo se deshace en un solo paso.

- **Pegar una animación en varias capas**
  Con varias capas seleccionadas, pegar una animación o unos fotogramas clave (Ctrl + V o el menú de la línea del tiempo) los pega en todas ellas, a partir del cursor de tiempo. El clic derecho sobre una capa o una barra de la selección ya no la deshace, y el menú indica en cuántas capas se pegará.

### Changed

- **Campos de color hexadecimal**
  Los campos de color (relleno, trazo, sombras, fondo del lienzo y fondo de la exportación) añaden el "#" si no se escribe, solo aceptan dígitos hexadecimales y no dejan escribir más de seis. Al salir del campo o pulsar Enter, un valor incompleto se completa siguiendo su patrón: "f" pasa a #ffffff, "c0" a #c0c0c0 y "abc" a #aabbcc. Escape descarta lo escrito. Vaciar el campo de relleno o de trazo los quita; en los demás, se recupera el color anterior.

- **Las pistas terminan con el proyecto**
  En la línea del tiempo, las pistas de las capas y sus propiedades se cortan donde termina la duración del proyecto, y lo que queda a la derecha aparece rayado, para que no parezca que se pueden poner fotogramas clave más adelante.

### Fixed

- **Grosor y posición del trazo sin trazo**
  Cuando la capa no tiene trazo, los campos Grosor y Posición del trazo se ocultan y vuelven a aparecer al añadirlo. Con un trazo de grosor 0, el desplegable de la posición no se abre.

## [1.1.0] — 2026-10-01

### Added

- **Desenfoque de movimiento al renderizar video**
  En la ventana de exportar, los formatos MP4 y WebM tienen la opción "Desenfoque de movimiento" con su Intensidad (10–100 %): la parte de cada fotograma en que el obturador queda abierto (50 % equivale a 180°, 100 % a 360°). Cada fotograma mezcla entre 4 y 16 instantes repartidos alrededor de su tiempo, así que lo que se mueve rápido deja una estela suave. El render tarda más, pero la duración del video no cambia. También funciona con fondo transparente en WebM.

- **Sombra paralela y sombra interna**
  En la sección Efectos del Inspector se puede añadir una Sombra paralela y una Sombra interna a cada capa, con color, opacidad, desplazamiento X e Y, desenfoque y extensión. La extensión agranda la sombra paralela (o la encoge con valores negativos) y lleva la sombra interna más hacia dentro. Las sombras giran y se escalan con la capa, se ven en el lienzo y se exportan a GIF, MP4, WebM y SVG. Los cambios se aplican a todas las capas seleccionadas. La sombra interna no está disponible en las capas de texto.

- **Posición del trazo**
  Junto al grosor del trazo, un desplegable define si el trazo va por dentro de la forma (Interior), centrado en el borde (Centro) o por fuera (Exterior). Las capas existentes conservan el trazo centrado.

- **Opacidad del relleno y del trazo**
  El relleno y el trazo tienen cada uno su campo de opacidad (en %), que se puede escribir o arrastrar desde su icono. Se animan junto con su color: el rombo de Relleno anima el color y la opacidad del relleno, y el de Trazo el color, la opacidad y el grosor.

- **Alinear y distribuir capas**
  Arriba del Inspector hay botones para alinear a la izquierda, al centro horizontal, a la derecha, arriba, al centro vertical y abajo. Con una capa seleccionada se alinea al lienzo; con varias, al recuadro que las contiene a todas. Con tres o más capas, "Distribuir horizontalmente" y "Distribuir verticalmente" dejan el mismo espacio entre ellas sin mover la primera ni la última. Se usan los bordes visibles de cada capa (también si está girada o escalada), las capas bloqueadas u ocultas no se mueven y cada acción se deshace en un solo paso. Si la posición está animada, se crea o actualiza el fotograma clave en el cursor de tiempo.

- **Alt + arrastrar duplica la capa**
  Al mantener Alt y arrastrar una capa en el lienzo, se crea una copia justo encima de cada capa seleccionada y lo que se mueve es la copia; el original queda en su sitio. Las copias quedan seleccionadas y todo se deshace en un solo paso. Alt + clic sin mover no copia nada.

- **Shift + arrastrar limita el movimiento a un eje**
  Al mantener Shift mientras se arrastra una capa, se mueve solo en horizontal o solo en vertical, según el eje en que el cursor se haya desplazado más. Se combina con Alt para duplicar en línea recta. Shift + clic sigue añadiendo o quitando la capa de la selección; sobre una capa ya seleccionada, la quita solo si no se arrastró.

- **Pantalla para dispositivos móviles**
  En teléfonos y tabletas pequeñas, Nori muestra una pantalla que indica que el editor está disponible solo para escritorio, porque necesita espacio para el lienzo, el Inspector y la línea del tiempo, además de teclado y ratón. "Continuar de todos modos" abre el editor igualmente durante esa sesión.

### Changed

- **Posición, Escala y Anclaje conservan las dos dimensiones**
  Al borrar todos los fotogramas clave de una dimensión (por ejemplo, Posición X) mientras la otra sigue animada, su fila se mantiene vacía en la línea del tiempo en lugar de desaparecer, y se le pueden volver a agregar fotogramas clave sin desactivar la otra. La propiedad conserva el valor que tenía. Cuando las dos dimensiones se quedan sin fotogramas clave, la animación se desactiva como antes.

- **Arrastrar una capa tiene un pequeño margen**
  El arrastre empieza después de mover el cursor unos píxeles, así que un clic sobre una capa ya no la desplaza por accidente.

### Fixed

- **Desplegables tapados al final de un panel**
  Los desplegables que no caben debajo (como el de la posición del trazo, al final del Inspector) se abren hacia arriba, en lugar de quedar ocultos detrás de la línea del tiempo.

- **Botón de tema**
  El botón para cambiar de tema ya no muestra la indicación al revés: en el tema oscuro dice "Cambiar a tema claro" y muestra el sol, y en el tema claro dice "Cambiar a tema oscuro" y muestra la luna. El icono y la indicación cambian en el momento de pulsarlo y también siguen al tema del sistema.

## [1.0.3] — 2026-10-01

### Added

- **Editar el inicio y la duración de la animación**
  Al seleccionar una capa (o su barra azul en la línea del tiempo), los campos Inicio y Duración de la sección Animación del Inspector se pueden editar escribiendo un valor o arrastrando su etiqueta. Cambiar el Inicio mueve todos los fotogramas clave de la capa; cambiar la Duración los redistribuye proporcionalmente desde el inicio, igual que al estirar la barra. Los valores se ajustan a los fotogramas y no salen de la línea del tiempo. Si todos los fotogramas clave están en el mismo instante, solo se puede cambiar el Inicio.

- **Ajustar la duración del proyecto a las animaciones**
  En los Ajustes del Proyecto, junto al campo Duración, un botón ajusta la duración para que termine en el último fotograma clave de la línea del tiempo. Se desactiva cuando no hay animaciones o la duración ya coincide.

### Changed

- **Curvas independientes en X e Y**
  Los fotogramas clave de Posición X e Y, Escala X e Y y Anclaje X e Y ya no comparten la curva de suavizado cuando están en el mismo tiempo: cambiar la curva de X no cambia la de Y, y al revés.

- **Campos en español**
  Los campos Start y Duration de la sección Animación ahora se llaman Inicio y Duración, y la sección "Curva de Suavizado (Value Curve)" se llama simplemente "Curva de Suavizado".

## [1.0.2] — 2026-10-01

### Added

- **Curvas Bézier al editar vértices**
  Los vértices seleccionados muestran sus tiradores Bézier (una línea y un rombo a cada lado); al arrastrarlos se curvan los lados que salen del vértice. Mover un vértice mueve también sus tiradores, así que la curva conserva su forma.

- **Agregar y quitar curvas**
  En el modo de edición de vértices aparece una barra en la parte superior del lienzo con "Agregar curva" y "Quitar curva", que actúan sobre los vértices seleccionados. Agregar curva convierte en curva los lados del vértice y le da dos tiradores alineados con los vértices vecinos; quitar curva lo vuelve a convertir en esquina y los lados sin tiradores vuelven a ser rectos. Un doble clic sobre un vértice hace lo mismo: lo curva si es una esquina y lo vuelve esquina si es curvo. También funciona en el vértice inicial de las formas cerradas (rectángulos, polígonos y estrellas convertidos en trazado).

- **Reflejo de los tiradores**
  La misma barra tiene tres opciones de Reflejo para los vértices seleccionados: "Sin reflejo" (cada tirador se mueve por separado), "Reflejar ángulo" (los tiradores quedan alineados en direcciones opuestas y cada uno conserva su longitud) y "Reflejar ángulo y longitud" (un tirador es el reflejo exacto del otro). Al elegir una opción, los tiradores del vértice se ajustan a ella, y al arrastrar un tirador el otro lo sigue según la opción del vértice. La opción marcada es la del vértice seleccionado. Alt + arrastrar un tirador lo mueve por separado y deja el vértice sin reflejo.

- **Estirar la animación de una capa**
  Los extremos de la barra azul de la capa en la línea del tiempo se pueden arrastrar: el extremo arrastrado se mueve y el otro queda fijo, y todos los fotogramas clave de la capa se redistribuyen proporcionalmente, así que la animación se hace más lenta o más rápida sin cambiar su ritmo. El extremo se ajusta a los fotogramas, no sale de la línea del tiempo y no puede cruzar el otro extremo. Se deshace en un solo paso.

### Changed

- **Pegar una animación de capa en el cursor de tiempo**
  Al pegar la animación de una capa (la barra azul completa), empieza en el cursor de tiempo en lugar de en el mismo punto del que se copió, igual que al pegar fotogramas clave. Si no cabe, se adelanta para terminar dentro de la línea del tiempo.

- **Cuadro de selección pegado a la capa**
  El borde de selección y sus tiradores de escala se dibujan justo sobre los bordes de la capa, sin el margen que quedaba alrededor. Lo mismo ocurre con el cuadro de la selección múltiple.

- **Animar la forma con curvas**
  La forma sigue transformándose de un fotograma clave a otro aunque en uno de ellos se hayan agregado o quitado curvas: los lados rectos se interpolan como curvas sin tiradores en lugar de cambiar de golpe a mitad de camino.

## [1.0.1] — 2026-10-01

### Changed

- **Navegar por fotogramas clave de la selección**
  "Ir al fotograma clave anterior" e "Ir al fotograma clave siguiente" (y Ctrl + F / Ctrl + G) saltan solo entre los fotogramas clave de las capas seleccionadas. Si no hay ninguna capa seleccionada, siguen saltando entre los de todas las capas.

- **Espacio: tocar para reproducir, mantener para desplazar**
  Un toque corto de Espacio reproduce o pausa la animación. Mantener Espacio pulsado (para arrastrar el lienzo) ya no inicia ni detiene la reproducción. El toque se reconoce aunque la reproducción esté en marcha y también justo después de editar un campo numérico del Inspector, que conserva el foco.

- **Mover el cursor de tiempo detiene la reproducción**
  Al hacer clic o arrastrar en la regla de la línea del tiempo, usar los botones de ir al inicio, al final o a un fotograma clave, o los atajos F y G, la reproducción se pausa.

### Fixed

- **Altura de los campos**
  Los campos de cada panel tienen la misma altura: en el Inspector, los campos de texto, los números, los desplegables (FPS, Grosor y la curva de suavizado), las muestras de color y los botones junto a ellos miden lo mismo; en la ventana de exportar, el campo y la muestra del color de fondo tienen la altura de los desplegables.

- **Espaciado de Rotación, Opacidad y Escala**
  La separación entre las etiquetas Rotación, Opacidad y Escala y sus campos es la misma que en Posición y Punto de Anclaje.

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