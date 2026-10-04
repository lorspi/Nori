// English texts defined in src/utils (messages, default names and the labels of constants that
// components render). Some shared keys ('Rectángulo', 'formato no válido'…) are in editor.ts.
export default {
  // Boolean operations (BOOLEAN_LABELS)
  Unión: 'Union',
  Unir: 'Union',
  'Une las formas en una sola': 'Joins the shapes into one',
  Resta: 'Subtract',
  Restar: 'Subtract',
  'Quita las formas de delante a la de más atrás': 'Removes the front shapes from the one at the back',
  Intersección: 'Intersect',
  Intersectar: 'Intersect',
  'Deja solo la parte que todas las formas comparten': 'Keeps only the area all the shapes share',
  Exclusión: 'Exclude',
  Excluir: 'Exclude',
  'Deja todo menos las partes donde las formas se superponen': 'Keeps everything except where the shapes overlap',

  // Groups
  Grupo: 'Group',
  'Selecciona al menos dos formas para combinarlas': 'Select at least two shapes to combine them',
  'Las formas deben estar en el mismo grupo para combinarlas': 'The shapes must be in the same group to combine them',
  'Selecciona una o más capas para agruparlas': 'Select one or more layers to group them',
  'Las capas deben estar en el mismo grupo para agruparlas': 'The layers must be in the same group to group them',
  'No se pudo calcular la forma combinada. Inténtalo de nuevo en otro instante.':
    "Couldn't compute the combined shape. Try again at another moment.",
  'La combinación está vacía en este instante: no hay forma que aplanar':
    'The combination is empty at this moment: there is no shape to flatten',
  'Los textos y los grupos no pueden formar parte de un grupo booleano': "Texts and groups can't be part of a boolean group",

  // Property labels (PROPERTY_META)
  'Posición X': 'Position X',
  'Posición Y': 'Position Y',
  'Anclaje X': 'Anchor X',
  'Anclaje Y': 'Anchor Y',
  'Escala X': 'Scale X',
  'Escala Y': 'Scale Y',
  Rotación: 'Rotation',
  Opacidad: 'Opacity',
  Relleno: 'Fill',
  'Opacidad del relleno': 'Fill opacity',
  Trazo: 'Stroke',
  'Opacidad del trazo': 'Stroke opacity',
  'Grosor de trazo': 'Stroke width',
  'Radio de esquinas': 'Corner radius',
  Ancho: 'Width',
  Alto: 'Height',
  Desenfoque: 'Blur',
  'Forma (vértices)': 'Shape (vertices)',

  // Easing curves (EASING_MENU)
  Personalizada: 'Custom',
  'Sin suavizado': 'No easing',
  'Cambio instantáneo, sin interpolar': 'Instant change, no interpolation',
  'Velocidad constante': 'Constant speed',
  'Arranca lento y acelera': 'Starts slow and speeds up',
  'Arranca rápido y frena': 'Starts fast and slows down',
  'Acelera y frena suavemente': 'Speeds up and slows down smoothly',
  'Toma impulso hacia atrás': 'Winds up backwards first',
  'Se pasa del final y regresa': 'Overshoots the end and comes back',
  'Rebota al llegar': 'Bounces on arrival',
  'Resorte con rebote físico': 'Spring with physical bounce',
  'Parámetros editados': 'Edited parameters',

  // Preset animations: categories
  Entrada: 'In',
  'La capa aparece desde el cursor de tiempo': 'The layer appears from the playhead',
  Salida: 'Out',
  'La capa desaparece desde el cursor de tiempo': 'The layer disappears from the playhead',
  'Entrada y salida': 'In and out',
  'Entra en el cursor de tiempo y sale al final de la línea del tiempo':
    'Comes in at the playhead and goes out at the end of the timeline',
  Movimiento: 'Motion',
  'La capa se mueve en su sitio y vuelve a su estado inicial': 'The layer moves in place and returns to how it was',

  // Preset animations: names
  Aparecer: 'Fade in',
  'Desde la izquierda': 'From the left',
  'Desde la derecha': 'From the right',
  'Desde abajo': 'From below',
  'Desde arriba': 'From above',
  Ampliar: 'Zoom in',
  Encoger: 'Shrink',
  Pop: 'Pop',
  Elástico: 'Elastic',
  'Caer con rebote': 'Drop with bounce',
  Girar: 'Spin',
  Enfocar: 'Focus',
  Desplegar: 'Unfold',
  Desvanecer: 'Fade out',
  'Hacia la izquierda': 'To the left',
  'Hacia la derecha': 'To the right',
  'Hacia arriba': 'Upwards',
  'Hacia abajo': 'Downwards',
  Reducir: 'Zoom out',
  'Ampliar y desvanecer': 'Zoom and fade',
  Hundir: 'Sink',
  Caer: 'Fall',
  'Girar y salir': 'Spin out',
  Desenfocar: 'Blur out',
  Plegar: 'Fold',
  'Aparecer y desvanecer': 'Fade in and out',
  'De izquierda a derecha': 'Left to right',
  'De derecha a izquierda': 'Right to left',
  'De abajo hacia arriba': 'Bottom to top',
  'De arriba hacia abajo': 'Top to bottom',
  'Ampliar y reducir': 'Zoom in and out',
  'Enfocar y desenfocar': 'Focus and blur',
  'Desplegar y plegar': 'Unfold and fold',
  Pulso: 'Pulse',
  Latido: 'Heartbeat',
  Sacudir: 'Shake',
  Tambalear: 'Wobble',
  Flotar: 'Float',
  Saltar: 'Jump',
  'Giro de 360°': '360° spin',
  Parpadear: 'Blink',
  Gelatina: 'Jelly',
  Tada: 'Tada',

  // Example projects (PRESET_PROJECTS)
  'El proyecto oficial de Nori con pétalos azules oscilantes y tipografía vectorial.':
    'The official Nori project with swaying blue petals and vector lettering.',
  'Personaje animado de Nori con balanceo de cabeza, guiño de ojo y trazos vectoriales.':
    'Animated Nori character with a head sway, a wink and vector strokes.',
  'Tarjeta flotante para interfaz de usuario con escala suave y entrada escalonada.':
    'Floating UI card with a smooth scale and a staggered entrance.',

  // Layer names of the intro example (noriIntro)
  'Pétalo superior': 'Top petal',
  'Pétalo derecho': 'Right petal',
  'Pétalo inferior': 'Bottom petal',
  'Pétalo izquierdo': 'Left petal',
  'Letra N': 'Letter N',
  'Letra o': 'Letter o',
  'Letra r': 'Letter r',
  'Letra i': 'Letter i',
  'Punto de la i': 'Dot of the i',

  // SVG import: default layer names
  Círculo: 'Circle',
  Línea: 'Line',
  Polilínea: 'Polyline',
  Trazado: 'Path',
  Texto: 'Text',
  'El archivo SVG no es válido': 'The SVG file is not valid',
  'El archivo no contiene un elemento <svg>': "The file doesn't contain an <svg> element",

  // Opening files
  'Error al procesar el archivo JSON: {error}': 'Error while reading the JSON file: {error}',
  'Formato no válido': 'Invalid format',
  '¡Animación Lottie importada con éxito! ({count} capas, {duration}s)':
    'Lottie animation imported! ({count} layers, {duration}s)',
  '¡Proyecto cargado con éxito! ({title})': 'Project loaded! ({title})',
  'El archivo JSON no tiene un formato compatible de Lottie ni de Nori.':
    "The JSON file isn't in a supported Lottie or Nori format.",
  'No se pudo importar el SVG: {error}': 'Could not import the SVG: {error}',
  'El SVG no contiene formas que se puedan importar': 'The SVG has no shapes that can be imported',
  'SVG animado importado: {count} capas, {duration}s{skipped}': 'Animated SVG imported: {count} layers, {duration}s{skipped}',
  'SVG importado: {count} capas{skipped}': 'SVG imported: {count} layers{skipped}',
  'No se pudo importar el frame: {error}': 'Could not import the frame: {error}',
  'El frame no contiene formas que se puedan importar': 'The frame has no shapes that can be imported',
  'Frame de Figma importado: {count} capas, {width} × {height} px{skipped}':
    'Figma frame imported: {count} layers, {width} × {height} px{skipped}',
  '"{name}" no es un archivo compatible: usa un proyecto de Nori o una animación Lottie (.json), o un .svg':
    '"{name}" is not a supported file: use a Nori project or a Lottie animation (.json), or an .svg',

  // Projects in the browser
  '{title} (copia)': '{title} (copy)',

  // Workspace backup
  'El archivo no es un .zip válido o está dañado': 'The file is not a valid .zip or is damaged',
  'El archivo no es un respaldo de Nori (falta nori-respaldo.json)': 'The file is not a Nori backup (nori-respaldo.json is missing)',
  'El índice del respaldo está dañado': 'The backup index is damaged',
  'El archivo no es un respaldo de Nori': 'The file is not a Nori backup',
  'El respaldo se creó con una versión más reciente de Nori; actualiza la aplicación':
    'The backup was made with a newer version of Nori; update the app',
  'El respaldo no contiene proyectos ni carpetas': 'The backup has no projects or folders',

  // Export progress
  'Renderizando fotograma {frame} de {total}...': 'Rendering frame {frame} of {total}...',
  'Comprimiendo archivo GIF...': 'Compressing GIF file...',
  '¡Exportación completada!': 'Export complete!',
  'Grabando fotograma {frame} de {total}...': 'Recording frame {frame} of {total}...',
  'Empaquetando video...': 'Packaging video...',
  '¡Video listo para descargar!': 'Video ready to download!',
  'Generando SVG vectorial animado...': 'Generating animated vector SVG...',
  '¡SVG generado con éxito!': 'SVG generated!',

  // Lottie export: names inside the file and warnings
  Transformar: 'Transform',
  Fondo: 'Background',
  'Algún fotograma de un grupo booleano no se pudo calcular y quedó vacío.':
    "Some frame of a boolean group couldn't be computed and was left empty.",
  'Lottie no tiene trazos interiores ni exteriores: se exportan centrados.':
    "Lottie has no inside or outside strokes: they're exported centered.",
  'Las sombras no se exportan a Lottie.': "Shadows aren't exported to Lottie.",
  'El desenfoque de las capas dentro de un grupo no se exporta a Lottie.': "Blur on layers inside a group isn't exported to Lottie.",
  'Los textos no se exportan a Lottie.': "Texts aren't exported to Lottie.",
  'El desenfoque se exporta como efecto de Lottie: algunos reproductores (como los de iOS y Android) no lo muestran.':
    "Blur is exported as a Lottie effect: some players (like the iOS and Android ones) don't show it.",
} satisfies Record<string, string>;
