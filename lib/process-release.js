/* eslint-disable n/no-deprecated-api */

'use strict'

const semver = require('semver')
const url = require('url')
const path = require('path')
const log = require('./log')

// versions where -headers.tar.gz started shipping
const headersTarballRange = '>= 3.0.0 || ~0.12.10 || ~0.10.42'
const bitsre = /\/win-(x86|x64|arm64)\//
const bitsreV3 = /\/win-(x86|ia32|x64)\// // io.js v3.x.x shipped with "ia32" but should
// have been "x86"

// Captures all the logic required to determine download URLs, local directory and
// file names. Inputs come from command-line switches (--target, --dist-url),
// `process.version` and `process.release` where it exists.
function processRelease (argv, gyp, defaultVersion, defaultRelease) {
  let version = (semver.valid(argv[0]) && argv[0]) || gyp.opts.target || process.env.npm_config_target
  const versionSemver = semver.parse(version)
  let overrideDistUrl = gyp.opts['dist-url'] || gyp.opts.disturl
  let name
  let distBaseUrl
  let nodeDistUrl = 'https://nodejs.org/dist'
  let baseUrl
  let libUrl32
  let libUrl64
  let libUrlArm64
  let tarballUrl

  if (!versionSemver) {
    // not a valid semver string, nothing we can do
    throw new Error('No valid version specified. Please specify a version using --target or npm_config_target')
  }
  // flatten version into String
  version = versionSemver.version

  // defaultVersion should come from process.version so ought to be valid semver
  const isDefaultVersion = version === semver.parse(defaultVersion).version

  // can't use process.release if we're using --target=x.y.z
  if (!isDefaultVersion) {
    defaultRelease = null
  }

  name = 'nw'

  // check for the nvm.sh standard mirror env variables
  if (!overrideDistUrl && process.env.NODEJS_ORG_MIRROR) {
    overrideDistUrl = process.env.NODEJS_ORG_MIRROR
  }

  if (overrideDistUrl) {
    log.verbose('download', 'using dist-url', overrideDistUrl)
  }

  if (overrideDistUrl) {
    distBaseUrl = overrideDistUrl.replace(/\/+$/, '')
    nodeDistUrl = overrideDistUrl.replace(/\/+$/, '')
  } else {
    distBaseUrl = 'https://node-webkit.s3.amazonaws.com'
  }
  distBaseUrl += '/v' + version + '/'

  // new style, based on process.release so we have a lot of the data we need
  const nodeSemver = semver.parse(defaultVersion)
  if (defaultRelease && defaultRelease.headersUrl && !overrideDistUrl) {
    baseUrl = url.resolve(defaultRelease.headersUrl, './')
    libUrl32 = resolveLibUrl('node', defaultRelease.libUrl || baseUrl || nodeDistUrl, 'x86', nodeSemver.major)
    libUrl64 = resolveLibUrl('node', defaultRelease.libUrl || baseUrl || nodeDistUrl, 'x64', nodeSemver.major)
    libUrlArm64 = resolveLibUrl('node', defaultRelease.libUrl || baseUrl || nodeDistUrl, 'arm64', nodeSemver.major)
  } else {
    // older versions without process.release are captured here and we have to make
    // a lot of assumptions, additionally if you --target=x.y.z then we can't use the
    // current process.release
    baseUrl = nodeDistUrl + '/v' + nodeSemver.version + '/'
    libUrl32 = resolveLibUrl('node', baseUrl, 'x86', nodeSemver.major)
    libUrl64 = resolveLibUrl('node', baseUrl, 'x64', nodeSemver.major)
    libUrlArm64 = resolveLibUrl('node', baseUrl, 'arm64', nodeSemver.major)
  }
  tarballUrl = url.resolve(distBaseUrl, name + '-headers-v' + version + '.tar.gz')

  return {
    version,
    semver: versionSemver,
    name,
    baseUrl,
    tarballUrl,
    shasumsUrl: url.resolve(distBaseUrl, 'SHASUMS256.txt'),
    versionDir: name + '-' + version,
    ia32: {
      libUrl: url.resolve(distBaseUrl, name + '.lib'),
      libNodeUrl: libUrl32,
      libPath: normalizePath(path.relative(url.parse(distBaseUrl).path, url.parse(url.resolve(distBaseUrl, name + '.lib')).path)),
      libNodePath: normalizePath(path.relative(url.parse(baseUrl).path, url.parse(libUrl32).path))
    },
    x64: {
      libUrl: url.resolve(distBaseUrl + 'x64/', name + '.lib'),
      libNodeUrl: libUrl64,
      libPath: normalizePath(path.relative(url.parse(distBaseUrl).path, url.parse(url.resolve(distBaseUrl + 'x64/', name + '.lib')).path)),
      libNodePath: normalizePath(path.relative(url.parse(baseUrl).path, url.parse(libUrl64).path))
    },
    arm64: {
      libUrl: url.resolve(distBaseUrl + 'arm64/', name + '.lib'),
      libNodeUrl: libUrlArm64,
      libPath: normalizePath(path.relative(url.parse(distBaseUrl).path, url.parse(url.resolve(distBaseUrl + 'arm64/', name + '.lib')).path)),
      libNodePath: normalizePath(path.relative(url.parse(baseUrl).path, url.parse(libUrlArm64).path))
    }
  }
}

function normalizePath (p) {
  return path.normalize(p).replace(/\\/g, '/')
}

function resolveLibUrl (name, defaultUrl, arch, versionMajor) {
  const base = url.resolve(defaultUrl, './')
  const hasLibUrl = bitsre.test(defaultUrl) || (versionMajor === 3 && bitsreV3.test(defaultUrl))

  if (!hasLibUrl) {
    // let's assume it's a baseUrl then
    if (versionMajor >= 1) {
      return url.resolve(base, 'win-' + arch + '/' + name + '.lib')
    }
    // prior to io.js@1.0.0 32-bit node.lib lives in /, 64-bit lives in /x64/
    return url.resolve(base, (arch === 'x86' ? '' : arch + '/') + name + '.lib')
  }

  // else we have a proper url to a .lib, just make sure it's the right arch
  return defaultUrl.replace(versionMajor === 3 ? bitsreV3 : bitsre, '/win-' + arch + '/')
}

module.exports = processRelease
