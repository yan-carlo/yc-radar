fx_version 'cerulean'
game 'gta5'

author 'Yan-Carlo'
description 'Sistema de radar aeroportuario militar para deteccion de aeronaves'
version '1.0.0'

shared_scripts {
    'shared/config.lua',
    'locales/es.lua',
    'locales/en.lua'
}

client_scripts {
    'client/main.lua',
    'client/pilot_hud.lua'
}

server_scripts {
    'server/main.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/sounds/click.mp3',
    'html/sounds/over.wav'
}
