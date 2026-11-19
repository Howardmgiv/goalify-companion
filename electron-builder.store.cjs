'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { build, version } = require('./package.json');

const output = path.join('dist', 'microsoft-store', version);
const artifactName = `Goalify-Companion-${version}-x64.msix`;

module.exports = {
  ...build,
  directories: { ...build.directories, output },
  toolsets: { winCodeSign: '1.1.0' },
  win: { ...build.win, target: [{ target: 'appx', arch: ['x64'] }] },
  appx: {
    artifactName,
    identityName: 'GriffifyStudiosLLC.GoalifyCompanion',
    applicationId: 'GoalifyCompanion',
    publisher: 'CN=7422D0EA-D803-4A04-B66A-86C20F2C0391',
    publisherDisplayName: 'Griffify Studios LLC',
    displayName: 'Goalify Companion',
    capabilities: ['internetClient'],
    languages: ['en-US'],
    minVersion: '10.0.19041.0',
    maxVersionTested: '10.0.19041.0',
    setBuildNumber: false,
  },
  beforePack() {
    if (fs.existsSync(path.join(__dirname, output, artifactName))) {
      throw new Error('Store package already exists. Increment the version before creating another release.');
    }
  },
};
