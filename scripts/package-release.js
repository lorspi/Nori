/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Script para generar un paquete distribuible de Nori.
 *
 * Uso: npm run release
 *
 * Genera una carpeta `release/` con todo lo necesario para ejecutar
 * Nori como servidor local sin necesidad de Node.js.
 * - Windows: usa un servidor HTTP embebido en PowerShell.
 * - Linux/macOS: usa python3 -m http.server.
 *
 * Nori usa el puerto 8001 (Kora usa el 8000) para que cada aplicación tenga
 * su propio origen en el navegador: datos y service worker separados.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');
const VERSION = fs.readFileSync(path.join(ROOT, 'public', 'version.txt'), 'utf-8').trim();

console.log(`\n🔨 Construyendo Nori v${VERSION} para distribución...\n`);

// 1. Build frontend
console.log('1/3 Compilando frontend...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

// 2. Create release folder
console.log('\n2/3 Creando paquete de distribución...');
if (fs.existsSync(RELEASE)) {
  fs.rmSync(RELEASE, { recursive: true });
}
fs.mkdirSync(RELEASE, { recursive: true });

// Copy dist (frontend build output)
fs.cpSync(path.join(ROOT, 'dist'), path.join(RELEASE, 'dist'), { recursive: true });

// Copy startup scripts from servidor-local/
fs.copyFileSync(
  path.join(ROOT, 'servidor-local', 'iniciar-servidor.bat'),
  path.join(RELEASE, 'iniciar-servidor.bat')
);
fs.copyFileSync(
  path.join(ROOT, 'servidor-local', 'iniciar-servidor.sh'),
  path.join(RELEASE, 'iniciar-servidor.sh')
);
fs.chmodSync(path.join(RELEASE, 'iniciar-servidor.sh'), 0o755);

// 3. Create LEEME.txt (español) and README.txt (English)
console.log('\n3/3 Generando LEEME.txt y README.txt...');
fs.writeFileSync(path.join(RELEASE, 'LEEME.txt'), `NORI - Estudio de Animación Vectorial Offline
==============================================
Versión: ${VERSION}
(English: see README.txt)

REQUISITOS:
- Windows: Ninguno (usa PowerShell, incluido en Windows 7+).
- Linux/macOS: Python 3 (preinstalado en la mayoría de distribuciones).

NO se necesita Node.js para ejecutar el servidor local.

INSTRUCCIONES:
==============================================

## Windows

1. Extrae todo el contenido del zip en una carpeta.
2. Haz doble clic en "iniciar-servidor.bat".
3. Se abrirá automáticamente el navegador en http://localhost:8001.

Para detener el servidor, cierra la ventana de la terminal.

## Linux / macOS

1. Extrae todo el contenido del zip en una carpeta.
2. Abre una terminal y navega hasta esa carpeta:
       cd ruta/de/la/carpeta
3. Dale permisos de ejecución al script:
       chmod +x iniciar-servidor.sh
4. Ejecuta el script:
       ./iniciar-servidor.sh
5. Se abrirá automáticamente el navegador en http://localhost:8001.

Para detener el servidor, presiona Ctrl+C en la terminal.

ACCESO:
==============================================
- Desde este computador: http://localhost:8001
- Desde otros dispositivos en la misma red: http://<IP-DE-ESTE-PC>:8001

ACTUALIZACIONES:
==============================================
Cuando abras Nori, la aplicación revisará si hay una versión más
reciente disponible. Si la hay, verás un aviso en la sección
"Acerca de" con un enlace para descargar la nueva versión.

SOLUCIÓN DE PROBLEMAS:
==============================================
| Problema                          | Solución                                          |
|-----------------------------------|---------------------------------------------------|
| "No se encuentra 'dist'"          | Verifica que extrajiste el zip completo.          |
| "No se encontró Python" (Linux)   | Instala Python 3 con tu gestor de paquetes.       |
| "Permiso denegado" (Linux/macOS)  | Ejecuta: chmod +x iniciar-servidor.sh             |
| localhost:8001 no carga           | Verifica que no haya otro programa en puerto 8001.|

NOTAS:
==============================================
- Todos tus proyectos se almacenan localmente en el navegador.
- No se envía información a servidores externos.
- Usa siempre el mismo navegador y la misma dirección (localhost:8001)
  para ver tus proyectos: cada navegador guarda los suyos.
- Mantén la ventana de la terminal abierta mientras uses Nori.

Más información: https://github.com/lorspi/Nori
`);

fs.writeFileSync(path.join(RELEASE, 'README.txt'), `NORI - Offline Vector Animation Studio
==============================================
Version: ${VERSION}
(Español: ver LEEME.txt)

REQUIREMENTS:
- Windows: None (uses PowerShell, included in Windows 7+).
- Linux/macOS: Python 3 (preinstalled on most distributions).

Node.js is NOT required to run the local server.

INSTRUCTIONS:
==============================================

## Windows

1. Extract the whole zip into a folder.
2. Double-click "iniciar-servidor.bat".
3. Your browser will open automatically at http://localhost:8001.

To stop the server, close the terminal window.

## Linux / macOS

1. Extract the whole zip into a folder.
2. Open a terminal and go to that folder:
       cd path/to/the/folder
3. Make the script executable:
       chmod +x iniciar-servidor.sh
4. Run the script:
       ./iniciar-servidor.sh
5. Your browser will open automatically at http://localhost:8001.

To stop the server, press Ctrl+C in the terminal.

ACCESS:
==============================================
- From this computer: http://localhost:8001
- From other devices on the same network: http://<THIS-PC-IP>:8001

UPDATES:
==============================================
When you open Nori, the app checks whether a newer version is
available. If there is one, you will see a notice in the "About"
section with a link to download the new version.

TROUBLESHOOTING:
==============================================
| Problem                           | Solution                                          |
|-----------------------------------|---------------------------------------------------|
| "The 'dist' folder was not found" | Make sure you extracted the whole zip.            |
| "Python was not found" (Linux)    | Install Python 3 with your package manager.       |
| "Permission denied" (Linux/macOS) | Run: chmod +x iniciar-servidor.sh                 |
| localhost:8001 does not load      | Make sure no other program is using port 8001.    |

NOTES:
==============================================
- All your projects are stored locally in the browser.
- No information is sent to external servers.
- Always use the same browser and the same address (localhost:8001)
  to see your projects: each browser keeps its own.
- Keep the terminal window open while you use Nori.

More information: https://github.com/lorspi/Nori
`);

// Done
console.log(`\n✅ Paquete generado en: ${RELEASE}`);
console.log('\nContenido:');
const files = fs.readdirSync(RELEASE);
files.forEach(f => {
  const stat = fs.statSync(path.join(RELEASE, f));
  console.log(`  ${stat.isDirectory() ? '📁' : '📄'} ${f}`);
});
console.log(`\nPara usar: extrae el contenido y ejecuta "iniciar-servidor.bat" (Windows) o "./iniciar-servidor.sh" (Linux/macOS).`);
