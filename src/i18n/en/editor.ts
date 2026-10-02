// English texts of the editor (Editor, App, the UI provider and the small-screen gate)
export default {
  // App
  'No se pudo abrir el proyecto': 'Could not open the project',
  'No se pudo guardar el proyecto en el navegador (espacio insuficiente o almacenamiento bloqueado)':
    'Could not save the project in the browser (not enough space or storage blocked)',
  'No se pudo importar el archivo': 'Could not import the file',

  // Small-screen gate
  'Nori es para escritorio': 'Nori is for desktop',
  'El editor necesita una pantalla amplia para el lienzo, el Inspector y la línea del tiempo, además de teclado y ratón o trackpad. Ábrelo desde una computadora para crear tus animaciones.':
    'The editor needs a wide screen for the canvas, the Inspector and the timeline, plus a keyboard and a mouse or trackpad. Open it on a computer to create your animations.',
  'Disponible solo en computadoras de escritorio y portátiles': 'Available only on desktop and laptop computers',
  'Continuar de todos modos': 'Continue anyway',

  // Dialogs
  Confirmar: 'Confirm',
  Cancelar: 'Cancel',
  Aceptar: 'OK',

  // History
  'No hay más acciones para deshacer': 'Nothing left to undo',

  // Keyframes and layer clipboard
  'Fotograma clave copiado': 'Keyframe copied',
  '{count} fotogramas clave copiados': '{count} keyframes copied',
  'Animación de "{name}" copiada': 'Animation of "{name}" copied',
  'Animación pegada en {count} capas': 'Animation pasted on {count} layers',
  'Animación pegada en "{name}"': 'Animation pasted on "{name}"',
  'Fotogramas clave pegados en {count} capas': 'Keyframes pasted on {count} layers',
  'Fotogramas clave pegados': 'Keyframes pasted',
  'Capa "{name}" copiada': 'Layer "{name}" copied',
  '{count} capas copiadas': '{count} layers copied',
  'Capa cortada': 'Layer cut',
  '{count} capas cortadas': '{count} layers cut',
  'Capa "{name}" pegada': 'Layer "{name}" pasted',
  'Capa "{name}" pegada sin animación': 'Layer "{name}" pasted without animation',
  '{count} capas pegadas': '{count} layers pasted',
  '{count} capas pegadas sin animación': '{count} layers pasted without animation',
  'No se pudo pegar el SVG: {error}': 'Could not paste the SVG: {error}',
  'formato no válido': 'invalid format',
  'El SVG no contiene formas que se puedan pegar': 'The SVG has no shapes that can be pasted',
  '1 capa': '1 layer',
  '{count} capas': '{count} layers',
  ' · {count} elementos no compatibles omitidos': ' · {count} unsupported elements skipped',
  'SVG animado pegado: {layers}{skipped}': 'Animated SVG pasted: {layers}{skipped}',
  'SVG pegado: {layers}{skipped}': 'SVG pasted: {layers}{skipped}',
  'Selecciona una capa para pegar los fotogramas clave': 'Select a layer to paste the keyframes',
  'Figma copia en un formato propio: en Figma usa "Copiar como SVG" para pegarlo aquí':
    'Figma copies in its own format: in Figma use "Copy as SVG" to paste it here',
  'El portapapeles no contiene capas de Nori ni código SVG': 'The clipboard has no Nori layers or SVG code',
  'El navegador no deja leer el portapapeles: usa Ctrl + V': "The browser doesn't allow reading the clipboard: use Ctrl + V",

  // Canvas context menu
  Copiar: 'Copy',
  Cortar: 'Cut',
  Pegar: 'Paste',
  'Pegar (comprobando…)': 'Paste (checking…)',
  'Pegar sin animación': 'Paste without animation',
  'Animaciones predeterminadas…': 'Animation presets…',
  Agrupar: 'Group',
  Desagrupar: 'Ungroup',
  'Aplanar en un trazado': 'Flatten into a path',
  Eliminar: 'Delete',
  'Eliminar {count} capas': 'Delete {count} layers',
  Supr: 'Del',

  // Preset animations
  'Animación "{preset}" añadida a "{name}"': 'Animation "{preset}" added to "{name}"',
  'Animación "{preset}" añadida a {count} capas': 'Animation "{preset}" added to {count} layers',

  // New layers (default names)
  Rectángulo: 'Rectangle',
  Elipse: 'Ellipse',
  Triángulo: 'Triangle',
  Polígono: 'Polygon',
  Estrella: 'Star',
  Copia: 'Copy',

  // Layers and boolean groups
  '{count} capas eliminadas': '{count} layers deleted',
  'Operación cambiada a {operation}': 'Operation changed to {operation}',
  'Selecciona un grupo booleano para aplanarlo': 'Select a boolean group to flatten it',
  'No se pudo cargar el motor de operaciones booleanas. Revisa la conexión e inténtalo de nuevo.':
    "Couldn't load the boolean operations engine. Check your connection and try again.",
  '"{name}" aplanado en un trazado': '"{name}" flattened into a path',
  'Selecciona un grupo para desagruparlo': 'Select a group to ungroup it',
  'Grupo desagrupado': 'Group ungrouped',
  'Grupo desagrupado. Las capas quedan como se ven ahora: la animación de posición, escala, rotación u opacidad del grupo no se conserva':
    "Group ungrouped. The layers stay as they look now: the group's position, scale, rotation or opacity animation isn't kept",

  // Project
  'Proyecto descargado: {fileName}': 'Project downloaded: {fileName}',
  'Proyecto renombrado a "{title}"': 'Project renamed to "{title}"',
} satisfies Record<string, string>;
