// English for the timeline, top bar, canvas overlays, tooltips, theme and language buttons
export default {
  // Timeline: context menu
  'Animaciones predeterminadas…': 'Animation presets…',
  'Copiar fotograma clave': 'Copy keyframe',
  'Copiar {count} fotogramas clave': 'Copy {count} keyframes',
  'Copiar animación de la capa': 'Copy layer animation',
  'Pegar animación en {count} capas': 'Paste animation into {count} layers',
  'Pegar animación en esta capa': 'Paste animation into this layer',
  'Pegar fotogramas clave en {count} capas': 'Paste keyframes into {count} layers',
  'Pegar fotogramas clave en el tiempo actual': 'Paste keyframes at current time',
  'Eliminar fotograma clave': 'Delete keyframe',
  'Eliminar {count} fotogramas clave': 'Delete {count} keyframes',

  // Key names
  Supr: 'Del',
  Espacio: 'Space',
  Flechas: 'Arrows',
  o: 'or',

  // Timeline: toolbar and rows
  'Arrastra para cambiar la altura de la línea del tiempo\nDoble clic para restablecerla':
    'Drag to change the timeline height\nDouble-click to reset it',
  'Ir al inicio': 'Go to start',
  'Ir al fotograma clave anterior': 'Go to previous keyframe',
  'Fotograma anterior': 'Previous frame',
  Pausar: 'Pause',
  Reproducir: 'Play',
  'Fotograma siguiente': 'Next frame',
  'Ir al fotograma clave siguiente': 'Go to next keyframe',
  'Ir al final': 'Go to end',
  'Escribe un tiempo y pulsa Enter para ir a él': 'Type a time and press Enter to go to it',
  'Tiempo actual (segundos)': 'Current time (seconds)',
  '{count} fotogramas clave seleccionados': '{count} keyframes selected',
  Zoom: 'Zoom',
  'Zoom de la línea del tiempo. También con la rueda del ratón y': 'Timeline zoom. Also with the mouse wheel and',
  'Capas y Propiedades': 'Layers and properties',
  'Mostrar las capas del grupo y sus parámetros animados': "Show the group's layers and their animated parameters",
  'Mostrar parámetros animados': 'Show animated parameters',
  Grupo: 'Group',
  'Grupo booleano: {name}': 'Boolean group: {name}',
  'Quitar fotograma clave en el tiempo actual': 'Remove keyframe at current time',
  'Añadir fotograma clave en el tiempo actual': 'Add keyframe at current time',
  'Arrastra para mover todos los fotogramas clave de la capa\nArrastra un extremo para estirar o encoger la animación\nShift o Ctrl + clic para seleccionar varias barras\nClic derecho para copiar o pegar':
    "Drag to move all of the layer's keyframes\nDrag an end to stretch or shrink the animation\nShift or Ctrl + click to select several bars\nRight-click to copy or paste",
  'Arrastra para estirar la animación desde el principio': 'Drag to stretch the animation from the start',
  'Arrastra para estirar la animación desde el final': 'Drag to stretch the animation from the end',
  'Tiempo: {time}s | Valor: {value}\nArrastrar para mover · Shift o Ctrl + clic para selección múltiple · Doble clic para borrar':
    'Time: {time}s | Value: {value}\nDrag to move · Shift or Ctrl + click to multi-select · Double-click to delete',

  // Top bar
  Deshacer: 'Undo',
  Rehacer: 'Redo',
  Seleccionar: 'Select',
  'Mano: desplazar el lienzo (o mantén Espacio)': 'Hand: pan the canvas (or hold Space)',
  'Añadir forma': 'Add shape',
  Rectángulo: 'Rectangle',
  Elipse: 'Ellipse',
  Triángulo: 'Triangle',
  Polígono: 'Polygon',
  Estrella: 'Star',
  Aplanar: 'Flatten',
  Inicio: 'Home',
  'Volver a los proyectos guardados': 'Back to saved projects',
  'Ir a la carpeta del proyecto': "Go to the project's folder",
  'Clic para renombrar el proyecto': 'Click to rename the project',
  'Nombre del proyecto': 'Project name',
  'Alternar fondo transparente con patrón ajedrez': 'Toggle checkerboard transparency background',
  Transparencia: 'Transparency',
  'Descargar proyecto (JSON)': 'Download project (JSON)',
  'Descargar proyecto': 'Download project',
  Exportar: 'Export',

  // Canvas overlays
  'Editando vértices (Esc o Enter para salir)': 'Editing vertices (Esc or Enter to exit)',
  '{count} capas seleccionadas': '{count} layers selected',
  'Añade tiradores Bézier a los vértices seleccionados\nTambién con doble clic en un vértice':
    'Adds Bézier handles to the selected vertices\nAlso by double-clicking a vertex',
  'Agregar curva': 'Add curve',
  'Quita los tiradores Bézier: los vértices vuelven a ser esquinas\nTambién con doble clic en un vértice curvo':
    'Removes the Bézier handles: the vertices become corners again\nAlso by double-clicking a curved vertex',
  'Quitar curva': 'Remove curve',
  Reflejo: 'Mirroring',
  'Sin reflejo': 'No mirroring',
  'Reflejar ángulo': 'Mirror angle',
  'Reflejar ángulo y longitud': 'Mirror angle and length',
  '{label}\nAlt + arrastrar un tirador lo mueve por separado': '{label}\nAlt + drag a handle to move it independently',
  'Espacio + Arrastrar: Desplazar': 'Space + Drag: Pan',
  'Ctrl + Rueda: Zoom': 'Ctrl + Wheel: Zoom',
  'Shift + Clic: Selección múltiple': 'Shift + Click: Multi-select',
  'Ocultar ayuda': 'Hide help',
  'Mostrar atajos del lienzo': 'Show canvas shortcuts',

  // Theme and language
  'Cambiar a tema claro': 'Switch to light theme',
  'Cambiar a tema oscuro': 'Switch to dark theme',
  Idioma: 'Language',
} satisfies Record<string, string>;
