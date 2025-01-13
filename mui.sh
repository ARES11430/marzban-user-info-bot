#!/bin/bash

if [[ $EUID -ne 0 ]]; then
    clear
    echo "You should run this script with root!"
    echo "Use sudo -i to change user to root"
    exit 1
fi
# Define the file path
env_file="/opt/marzban/.env"

function mui-setup {
    clear
    cd
    if [ -f "mui-bot/docker-compose.yml" ] && [ -f "mui-bot/docker-compose.override.yml" ]; then
        echo "mui-bot already installed."
        read -n 1 -s -r -p "Press any key to continue"
        return 0
    else
        apt-get update -y
        if ! command -v curl &> /dev/null; then
            apt-get install curl -y
        fi
        if ! command -v socat &> /dev/null; then
            apt-get install socat -y
        fi
        if ! command -v socat &> /dev/null; then
            apt-get install git -y
        fi           
        cd
        mkdir mui-bot
        cd mui-bot
        read -p "Enter your telegram bot token: " tbt
        read -p "Enter your telegram User ID: " tui
        #Creating a Docker Compose File
        cat <<EOF > docker-compose.yml
services:
  mui-bot:
    container_name: mui-bot
    image: ares11430/mui-bot:latest
    network_mode: host
    restart: always
    volumes:
      - ./data:/app/data
EOF
        # Extract the line containing SQLALCHEMY_DATABASE_URL
        db_url=$(grep 'SQLALCHEMY_DATABASE_URL=' "$env_file")
        # Extract the username and password using parameter expansion
        db_url=${db_url#*mysql+pymysql://} # Remove the prefix
        username=${db_url%%:*}             # Extract username before the colon
        temp=${db_url#*:}                  # Remove username and colon
        password=${temp%%@*}               # Extract password before the @ symbol
        #Creating an Override File for Environment Variables
        cat <<EOF > docker-compose.override.yml
services:
  mui-bot:
    environment:
      TELEGRAM_MUI_TOKEN: $tbt
      TELEGRAM_MUI_MAIN_ADMIN_ID: $tui
      MUI_DB_HOST: 127.0.0.1
      MUI_DB_USER: $username
      MUI_DB_PASSWORD: $password
      MUI_DB_NAME: marzban
EOF
        docker compose up -d
    fi
}
function mui-logs {
    clear
    cd
    if [ ! -d "mui-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
        cd mui-bot    
        docker compose logs -f
    fi      
}
function mui-restart {
    clear
      cd
    if [ ! -d "mui-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mui-bot    
      docker compose stop
      docker compose up -d
    fi
}
function mui-stop {
    clear
    cd
    if [ ! -d "mui-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mui-bot    
      docker compose stop
    fi
}
function mui-updatep {
    clear
    cd
    if [ ! -d "mui-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mui-bot    
      docker compose down
      docker compose pull mui-bot
      docker compose up -d
    fi
}
function mui-config {
    clear
    cd
    if [ ! -d "mui-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
      cd mui-bot    
      nano ./data/config.json
    fi
}
function mui-remove {
    clear
    cd
    if [ ! -d "mui-bot" ]; then
        echo "the bot is not installed yet"
        read -n 1 -s -r -p "Press any key to continue"
    else
        docker compose down -v
        rm -rf /mui-bot
    fi
}

while true; do
clear
    echo "MUI-Bot SetUp"
    echo "Menu:"
    echo "1  - Install the Bot"
    echo "2  - View Logs"
    echo "3  - Restart The Bot"
    echo "4  - Stop The Bot"
    echo "5  - Update The Bot"
    echo "6  - View and Edit the Config"
    echo "7  - Remove the mui-bot"
    echo "8  - Exit"
    read -p "Enter your choice: " choice
    case $choice in
        1) mui-setup;;
        2) mui-logs;;
        3) mui-restart;;
        4) mui-stop;;
        5) mui-updatep;;
        6) mui-config;;
        7) mui-remove;;
        8) echo "Exiting..."; exit;;
        *) echo "Invalid choice. Please enter a valid option.";;
    esac
done
    
