// English texts of the Inspector, the curve editor and the small fields they use
export default {
  // Layer header
  'Clic para renombrar la capa': 'Click to rename the layer',
  'Nombre de la capa': 'Layer name',
  'Duplicar capa': 'Duplicate layer',
  'Eliminar capa': 'Delete layer',

  // Project settings
  'Ajustes del Proyecto': 'Project settings',
  'Nombre': 'Name',
  'Ancho (px)': 'Width (px)',
  'Alto (px)': 'Height (px)',
  'Duración (s)': 'Duration (s)',
  'Ajustar la duración a las animaciones': 'Fit the duration to the animations',
  'Fondo del Lienzo': 'Canvas background',
  'Color de fondo': 'Background color',
  'Sin fondo': 'No background',
  'Añadir fondo': 'Add background',
  'Quitar fondo (lienzo transparente)': 'Remove background (transparent canvas)',
  'Selecciona cualquier capa en el lienzo o en la línea de tiempo para inspeccionar y editar sus propiedades y curvas de suavizado.':
    'Select any layer on the canvas or in the timeline to inspect and edit its properties and easing curves.',

  // Align & distribute
  'Alinear {count} capas': 'Align {count} layers',
  'Alinear al lienzo': 'Align to canvas',
  'Alinear a la izquierda': 'Align left',
  'Centrar horizontalmente': 'Center horizontally',
  'Alinear a la derecha': 'Align right',
  'Alinear arriba': 'Align top',
  'Centrar verticalmente': 'Center vertically',
  'Alinear abajo': 'Align bottom',
  'Distribuir horizontalmente': 'Distribute horizontally',
  'Distribuir verticalmente': 'Distribute vertically',
  '{action} de la selección': '{action} within the selection',
  '{action} del lienzo': '{action} on the canvas',
  '{action}: mismo espacio entre las capas (selecciona 3 o más)': '{action}: equal spacing between layers (select 3 or more)',

  // Boolean operations and groups
  'Combinar {count} capas': 'Combine {count} layers',
  'Operación booleana': 'Boolean operation',
  'Unión': 'Union',
  'Resta': 'Subtract',
  'Intersección': 'Intersect',
  'Exclusión': 'Exclude',
  'Deja todo menos las partes donde las formas se superponen': 'Keeps everything except where the shapes overlap',
  'Combina las formas seleccionadas en un grupo booleano. Las formas siguen siendo editables y animables dentro del grupo.':
    'Combines the selected shapes into a boolean group. The shapes stay editable and animatable inside the group.',
  'Convierte el grupo en un solo trazado con su forma en el fotograma actual':
    'Turns the group into a single path with its shape at the current frame',
  'Aplanar': 'Flatten',
  'Saca las formas del grupo, donde se ven ahora, y elimina el grupo':
    'Takes the shapes out of the group, where they are now, and deletes the group',
  'Desagrupar': 'Ungroup',
  'Las formas del grupo siguen siendo editables y animables: haz doble clic en el lienzo para seleccionar una, o elígela en la línea del tiempo. El relleno, el trazo y los efectos son los del grupo.':
    "The group's shapes stay editable and animatable: double-click on the canvas to select one, or pick it in the timeline. The fill, stroke and effects are the group's.",
  'Grupo': 'Group',
  'Saca las capas del grupo, donde se ven ahora, y elimina el grupo':
    'Takes the layers out of the group, where they are now, and deletes the group',
  'El grupo mueve, gira, escala y desvanece todas sus capas a la vez. Cada capa conserva su estilo y su animación: haz doble clic en el lienzo para seleccionar una, o elígela en la línea del tiempo.':
    'The group moves, rotates, scales and fades all its layers at once. Each layer keeps its own style and animation: double-click on the canvas to select one, or pick it in the timeline.',
  'Pone las capas seleccionadas en un grupo para animarlas juntas': 'Puts the selected layers in a group to animate them together',
  'Agrupar {count} capas': 'Group {count} layers',
  'Esta capa está dentro de': 'This layer is inside',
  'Su posición, rotación y escala son relativas al grupo, que también puede animarse.':
    'Its position, rotation and scale are relative to the group, which can be animated too.',
  'Esta forma está dentro de': 'This shape is inside',
  'Su posición es relativa al grupo y se dibuja con el relleno, el trazo y los efectos del grupo.':
    "Its position is relative to the group, and it's drawn with the group's fill, stroke and effects.",
  'Seleccionar el grupo': 'Select the group',

  // Animation timing
  'Animación': 'Animation',
  'Inicio##tiempo': 'Start',
  'Duración': 'Duration',
  'Momento en que empieza la animación de la capa': "When the layer's animation starts",
  'Duración de la animación de la capa': "Length of the layer's animation",
  'La capa no tiene fotogramas clave': 'The layer has no keyframes',

  // Easing curve section
  'Curva de Suavizado': 'Easing curve',
  '{count} fotogramas clave': '{count} keyframes',
  'Activa la animación de un parámetro con el icono': 'Turn on animation for a property with the',
  'para crear fotogramas clave y editar su curva.': 'icon to create keyframes and edit their curve.',
  'Selecciona uno o varios fotogramas clave en la línea del tiempo (Shift/Ctrl + clic o arrastrando un recuadro) para editar su curva de suavizado.':
    'Select one or more keyframes in the timeline (Shift/Ctrl + click or drag a box) to edit their easing curve.',
  'Los fotogramas seleccionados tienen curvas distintas; al editar se aplicará esta a todos.':
    'The selected keyframes have different curves; editing applies this one to all of them.',

  // Animation toggles
  'Activar animación de {name}': 'Animate {name}',
  'Desactivar animación de {name}': 'Stop animating {name}',
  'posición': 'position',
  'punto de anclaje': 'anchor point',
  'escala': 'scale',
  'rotación': 'rotation',
  'opacidad': 'opacity',
  'radio de esquinas': 'corner radius',
  'forma': 'shape',
  'desenfoque': 'blur',
  'relleno': 'fill',
  'trazo': 'stroke',

  // Transform
  'Transformación': 'Transform',
  'Posición': 'Position',
  'Posición X': 'Position X',
  'Posición Y': 'Position Y',
  'Punto de Anclaje': 'Anchor point',
  'Centrar punto de anclaje (0, 0)': 'Center anchor point (0, 0)',
  'Centrar (0, 0)': 'Center (0, 0)',
  'Punto de anclaje X (horizontal)': 'Anchor point X (horizontal)',
  'Punto de anclaje Y (vertical)': 'Anchor point Y (vertical)',
  'Escala': 'Scale',
  'Vincular proporción': 'Lock aspect ratio',
  'Rotación': 'Rotation',
  'Opacidad': 'Opacity',

  // Shape
  'Forma': 'Shape',
  'Lados': 'Sides',
  'Puntas': 'Points',
  'Interior': 'Inside',
  'Radio interior': 'Inner radius',
  'Radio interior respecto al exterior': 'Inner radius relative to the outer one',
  'Esquinas redondeadas': 'Rounded corners',
  'Radio': 'Radius',
  'Vértices': 'Vertices',
  'Convertir en trazado y editar vértices': 'Convert to path and edit vertices',
  'Terminar edición': 'Finish editing',
  'Editar vértices': 'Edit vertices',
  'La forma pasa a ser un trazado con vértices editables.': 'The shape becomes a path with editable vertices.',
  'Arrastra los vértices en el lienzo (o haz doble clic en el trazado). Selecciona varios con un recuadro o Shift + clic, y muévelos con las flechas (Shift: 10 px). Doble clic en un vértice (o "Agregar curva") le añade tiradores Bézier; arrástralos para curvar los lados. Activa el rombo para animar la forma: cada fotograma clave guarda la posición de los vértices.':
    'Drag the vertices on the canvas (or double-click the path). Select several with a box or Shift + click, and move them with the arrow keys (Shift: 10 px). Double-click a vertex (or "Add curve") to give it Bézier handles; drag them to curve the sides. Turn on the diamond to animate the shape: each keyframe stores the vertex positions.',

  // Effects
  'Efectos': 'Effects',
  'Desenfoque': 'Blur',
  'Quitar desenfoque': 'Remove blur',
  'Añadir desenfoque': 'Add blur',
  'Desenfoque gaussiano': 'Gaussian blur',
  'Sombra paralela': 'Drop shadow',
  'Sombra interna': 'Inner shadow',
  'Quitar sombra paralela': 'Remove drop shadow',
  'Añadir sombra paralela': 'Add drop shadow',
  'Color de la sombra paralela': 'Drop shadow color',
  'Opacidad de la sombra paralela': 'Drop shadow opacity',
  'Quitar sombra interna': 'Remove inner shadow',
  'Añadir sombra interna': 'Add inner shadow',
  'Color de la sombra interna': 'Inner shadow color',
  'Opacidad de la sombra interna': 'Inner shadow opacity',
  'Desplazamiento horizontal': 'Horizontal offset',
  'Desplazamiento vertical': 'Vertical offset',
  'Desenfoque de la sombra': 'Shadow blur',
  'Extensión': 'Spread',
  'Agranda la sombra (o la encoge, con valores negativos)': 'Enlarges the shadow (or shrinks it, with negative values)',
  'Lleva la sombra más hacia dentro (o la acerca al borde, con valores negativos)':
    'Pushes the shadow further inward (or toward the edge, with negative values)',

  // Text
  'Contenido de Texto': 'Text content',
  'Tamaño': 'Size',
  'Grosor': 'Weight',

  // Fill & stroke
  'Relleno y Trazo': 'Fill and stroke',
  'Relleno': 'Fill',
  'Trazo': 'Stroke',
  'Sin relleno': 'No fill',
  'Sin trazo': 'No stroke',
  'Color de relleno': 'Fill color',
  'Color del trazo': 'Stroke color',
  'Opacidad del relleno': 'Fill opacity',
  'Opacidad del trazo': 'Stroke opacity',
  'Añadir relleno': 'Add fill',
  'Añadir trazo': 'Add stroke',
  'Quitar relleno': 'Remove fill',
  'Quitar trazo': 'Remove stroke',
  'Grosor del trazo': 'Stroke width',
  'Centro': 'Center',
  'Exterior': 'Outside',
  'Posición del trazo respecto al borde de la forma': "Stroke position relative to the shape's edge",
  'Posición del trazo': 'Stroke position',

  // Property names (PROPERTY_META, shown in the curve label and the timeline values)
  'Anclaje X': 'Anchor X',
  'Anclaje Y': 'Anchor Y',
  'Escala X': 'Scale X',
  'Escala Y': 'Scale Y',
  'Grosor de trazo': 'Stroke width',
  'Radio de esquinas': 'Corner radius',
  'Ancho': 'Width',
  'Alto': 'Height',
  'Forma (vértices)': 'Shape (vertices)',

  // Curve editor
  'Curva de suavizado': 'Easing curve',
  'Gráfica de la curva de suavizado': 'Easing curve graph',
  'Arrastra el punto: altura = rebote, posición = velocidad': 'Drag the point: height = bounce, position = speed',
  'Arrastra el punto: altura = elasticidad, posición = rebotes': 'Drag the point: height = elasticity, position = bounces',
  'Arrastra los puntos para ajustar la curva': 'Drag the points to adjust the curve',
  'Previsualizar la animación ({duration}s)': 'Preview the animation ({duration}s)',
  'Stop': 'Stop',
  'Test': 'Test',
  'Equivalente en CSS': 'CSS equivalent',
  'Stiffness (Rigidez)': 'Stiffness',
  'Damping (Fricción)': 'Damping',
  'Mass (Masa)': 'Mass',
  'Rebotes': 'Bounces',
  'Elasticidad': 'Elasticity',
  'Velocidad constante, sin parámetros. Elige «Personalizada» para editar la curva con puntos.':
    'Constant speed, no parameters. Choose "Custom" to edit the curve with points.',
  'Sin interpolación: el valor se mantiene y cambia de golpe al llegar al siguiente fotograma clave.':
    'No interpolation: the value holds and changes all at once on the next keyframe.',

  // Easing menu (EASING_MENU)
  'Sin suavizado': 'No easing',
  'Cambio instantáneo, sin interpolar': 'Instant change, no interpolation',
  'Linear': 'Linear',
  'Ease in': 'Ease in',
  'Ease out': 'Ease out',
  'Ease in-out': 'Ease in-out',
  'Back in': 'Back in',
  'Back out': 'Back out',
  'Bounce': 'Bounce',
  'Spring': 'Spring',
  'Personalizada': 'Custom',
  'Velocidad constante': 'Constant speed',
  'Arranca lento y acelera': 'Starts slow and speeds up',
  'Arranca rápido y frena': 'Starts fast and slows down',
  'Acelera y frena suavemente': 'Speeds up and slows down smoothly',
  'Se pasa del final y regresa': 'Overshoots the end and comes back',
  'Rebota al llegar': 'Bounces on arrival',
  'Resorte con rebote físico': 'Spring with physical bounce',
  'Parámetros editados': 'Edited parameters',

  // Draggable values
  'Arrastra a los lados para cambiar el valor. Más rápido con': 'Drag sideways to change the value. Faster with',
  'Arrastra a los lados para cambiar el valor o haz clic para escribirlo. Más rápido con':
    'Drag sideways to change the value, or click to type it. Faster with',
} satisfies Record<string, string>;
