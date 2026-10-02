#!/bin/bash

# ============================================================
#  Nori - Servidor Local / Local Server (Linux / macOS)
# ============================================================

# Ir al directorio donde está este script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || { echo "ERROR: No se pudo acceder al directorio del script. / Could not access the script directory."; exit 1; }

# UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Título de la terminal
printf "\033]0;Nori - Servidor Local / Local Server\007"

echo ""
echo "▄▄  ▄▄  ▄▄▄  ▄▄▄▄  ▄▄ "
echo "███▄██ ██▀██ ██▄█▄ ██ "
echo "██ ▀██ ▀███▀ ██ ██ ██ "
echo ""

# Colores ANSI
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED_BG='\033[41m'
BOLD='\033[1m'
NC='\033[0m'

PORT=8001
URL="http://localhost:$PORT"

printf "${GREEN}  [OK] Servidor iniciado correctamente / Server started successfully${NC}\n"
echo ""
printf "${CYAN}  >>  Abriendo / Opening $URL ...${NC}\n"
echo ""
printf "${YELLOW}${RED_BG}${BOLD}  [!] NO CIERRES ESTA VENTANA / DO NOT CLOSE THIS WINDOW${NC}\n"
printf "${YELLOW}      El servidor se detendra si la cierras.${NC}\n"
printf "${YELLOW}      The server will stop if you close it.${NC}\n"
echo ""

sleep 0.5

# Abrir navegador
case "$(uname -s)" in
    Darwin*)
        open "$URL"
        ;;
    Linux*)
        if command -v xdg-open &>/dev/null; then
            xdg-open "$URL" >/dev/null 2>&1
        elif command -v sensible-browser &>/dev/null; then
            sensible-browser "$URL" >/dev/null 2>&1
        else
            echo "  [!] No se pudo abrir el navegador. / Could not open the browser."
            echo "      Abre / Open $URL manualmente / manually."
        fi
        ;;
    *)
        echo "  [!] No se pudo abrir el navegador. / Could not open the browser."
        echo "      Abre / Open $URL manualmente / manually."
        ;;
esac

# Verificar que existe el directorio dist
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo ""
    echo "ERROR: No se encuentra el directorio 'dist'. / The 'dist' folder was not found."
    echo "Verifica que extrajiste el zip completo. / Make sure you extracted the whole zip."
    echo ""
    read -p "Presiona Enter para salir... / Press Enter to exit..."
    exit 1
fi

cd "$SCRIPT_DIR/dist" || exit 1

# Buscar python3 o python
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
fi

if [ -z "$PYTHON" ]; then
    echo ""
    echo "ERROR: No se encontró Python (python3 o python). / Python was not found (python3 or python)."
    echo "Instálalo con tu gestor de paquetes: / Install it with your package manager:"
    echo "  Linux (Debian/Ubuntu):  sudo apt install python3"
    echo "  Linux (Fedora):         sudo dnf install python3"
    echo "  macOS:                  brew install python3"
    echo ""
    read -p "Presiona Enter para salir... / Press Enter to exit..."
    exit 1
fi

echo ""
echo "  Sirviendo archivos desde / Serving files from: $(pwd)"
echo "  Presiona Ctrl+C para detener el servidor. / Press Ctrl+C to stop the server."
echo ""

$PYTHON -m http.server $PORT
