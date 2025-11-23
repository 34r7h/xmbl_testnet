module.exports = {
  appId: 'com.xmbl.desktop',
  productName: 'XMBL Desktop',
  directories: {
    output: 'dist'
  },
  files: [
    'main/**/*',
    'renderer/**/*',
    'preload/**/*',
    'src/**/*',
    'node_modules/**/*',
    'package.json'
  ],
  mac: {
    category: 'public.app-category.finance',
    target: 'dmg'
  },
  win: {
    target: 'nsis'
  },
  linux: {
    target: 'AppImage'
  }
};

