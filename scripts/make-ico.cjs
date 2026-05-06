const { default: pngToIco } = require('png-to-ico')
const fs = require('fs')
const path = require('path')

pngToIco(path.join(__dirname, '../build/icon.png'))
  .then(buf => {
    fs.writeFileSync(path.join(__dirname, '../build/icon.ico'), buf)
    console.log('icon.ico generado correctamente')
  })
  .catch(err => {
    console.error('Error generando icon.ico:', err)
    process.exit(1)
  })
