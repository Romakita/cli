const { resolve } = require('path')

const Arborist = require('@npmcli/arborist')
const t = require('tap')
const requireInject = require('require-inject')

const redactCwd = (path) => {
  const normalizePath = p => p
    .replace(/\\+/g, '/')
    .replace(/\r\n/g, '\n')
  return normalizePath(path)
    .replace(new RegExp(normalizePath(process.cwd()), 'g'), '{CWD}')
}

t.cleanSnapshot = (str) => redactCwd(str)

let reifyOutput
const npm = {
  globalDir: null,
  prefix: null,
  flatOptions: {},
  config: {
    get () {
      return false
    },
  },
}
const printLinks = async (opts) => {
  let res = ''
  const arb = new Arborist(opts)
  const tree = await arb.loadActual()
  const linkedItems = [...tree.inventory.values()]
    .sort((a, b) => a.pkgid.localeCompare(b.pkgid))
  for (const item of linkedItems) {
    if (item.target)
      res += `${item.path} -> ${item.target.path}\n`
  }
  return res
}

const mocks = {
  '../../lib/npm.js': npm,
  '../../lib/utils/reify-output.js': () => reifyOutput(),
}

const link = requireInject('../../lib/link.js', mocks)

t.test('link to globalDir when in current working dir of pkg and no args', (t) => {
  t.plan(2)

  const testdir = t.testdir({
    'global-prefix': {
      lib: {
        node_modules: {
          a: {
            'package.json': JSON.stringify({
              name: 'a',
              version: '1.0.0',
            }),
          },
        },
      },
    },
    'test-pkg-link': {
      'package.json': JSON.stringify({
        name: 'test-pkg-link',
        version: '1.0.0',
      }),
    },
  })
  npm.globalDir = resolve(testdir, 'global-prefix', 'lib', 'node_modules')
  npm.prefix = resolve(testdir, 'test-pkg-link')

  reifyOutput = async () => {
    reifyOutput = undefined

    const links = await printLinks({
      path: resolve(npm.globalDir, '..'),
      global: true,
    })

    t.matchSnapshot(links, 'should create a global link to current pkg')
  }

  link([], (err) => {
    t.ifError(err, 'should not error out')
  })
})

t.test('link global linked pkg to local nm when using args', (t) => {
  t.plan(2)

  const testdir = t.testdir({
    'global-prefix': {
      lib: {
        node_modules: {
          '@myscope': {
            foo: {
              'package.json': JSON.stringify({
                name: '@myscope/foo',
                version: '1.0.0',
              }),
            },
            bar: {
              'package.json': JSON.stringify({
                name: '@myscope/bar',
                version: '1.0.0',
              }),
            },
            linked: t.fixture('symlink', '../../../../scoped-linked'),
          },
          a: {
            'package.json': JSON.stringify({
              name: 'a',
              version: '1.0.0',
            }),
          },
          b: {
            'package.json': JSON.stringify({
              name: 'b',
              version: '1.0.0',
            }),
          },
          'test-pkg-link': t.fixture('symlink', '../../../test-pkg-link'),
        },
      },
    },
    'test-pkg-link': {
      'package.json': JSON.stringify({
        name: 'test-pkg-link',
        version: '1.0.0',
      }),
    },
    'link-me-too': {
      'package.json': JSON.stringify({
        name: 'link-me-too',
        version: '1.0.0',
      }),
    },
    'scoped-linked': {
      'package.json': JSON.stringify({
        name: '@myscope/linked',
        version: '1.0.0',
      }),
    },
    'my-project': {
      'package.json': JSON.stringify({
        name: 'my-project',
        version: '1.0.0',
        dependencies: {
          foo: '^1.0.0',
        },
      }),
      node_modules: {
        foo: {
          'package.json': JSON.stringify({
            name: 'foo',
            version: '1.0.0',
          }),
        },
      },
    },
  })
  npm.globalDir = resolve(testdir, 'global-prefix', 'lib', 'node_modules')
  npm.prefix = resolve(testdir, 'my-project')

  const _cwd = process.cwd()
  process.chdir(npm.prefix)

  reifyOutput = async () => {
    reifyOutput = undefined
    process.chdir(_cwd)

    const links = await printLinks({
      path: npm.prefix,
    })

    t.matchSnapshot(links, 'should create a local symlink to global pkg')
  }

  // installs examples for:
  // - test-pkg-link: pkg linked to globalDir from local fs
  // - @myscope/linked: scoped pkg linked to globalDir from local fs
  // - @myscope/bar: prev installed scoped package available in globalDir
  // - a: prev installed package available in globalDir
  // - file:./link-me-too: pkg that needs to be reified in globalDir first
  link([
    'test-pkg-link',
    '@myscope/linked',
    '@myscope/bar',
    'a',
    'file:../link-me-too',
  ], (err) => {
    t.ifError(err, 'should not error out')
  })
})

t.test('link pkg already in global space', (t) => {
  t.plan(2)

  const testdir = t.testdir({
    'global-prefix': {
      lib: {
        node_modules: {
          '@myscope': {
            linked: t.fixture('symlink', '../../../../scoped-linked'),
          },
        },
      },
    },
    'scoped-linked': {
      'package.json': JSON.stringify({
        name: '@myscope/linked',
        version: '1.0.0',
      }),
    },
    'my-project': {
      'package.json': JSON.stringify({
        name: 'my-project',
        version: '1.0.0',
      }),
    },
  })
  npm.globalDir = resolve(testdir, 'global-prefix', 'lib', 'node_modules')
  npm.prefix = resolve(testdir, 'my-project')

  const _cwd = process.cwd()
  process.chdir(npm.prefix)

  reifyOutput = async () => {
    reifyOutput = undefined
    process.chdir(_cwd)

    const links = await printLinks({
      path: npm.prefix,
    })

    t.matchSnapshot(links, 'should create a local symlink to global pkg')
  }

  // installs examples for:
  // - test-pkg-link: pkg linked to globalDir from local fs
  // - @myscope/linked: scoped pkg linked to globalDir from local fs
  // - @myscope/bar: prev installed scoped package available in globalDir
  // - a: prev installed package available in globalDir
  // - file:./link-me-too: pkg that needs to be reified in globalDir first
  link(['@myscope/linked'], (err) => {
    t.ifError(err, 'should not error out')
  })
})

t.test('completion', (t) => {
  const testdir = t.testdir({
    'global-prefix': {
      lib: {
        node_modules: {
          foo: {},
          bar: {},
          lorem: {},
          ipsum: {},
        },
      },
    },
  })
  npm.globalDir = resolve(testdir, 'global-prefix', 'lib', 'node_modules')

  link.completion({}, (err, words) => {
    t.ifError(err, 'should not error out')
    t.deepEqual(
      words,
      ['bar', 'foo', 'ipsum', 'lorem'],
      'should list all package names available in globalDir'
    )
    t.end()
  })
})

t.test('--global option', (t) => {
  const _config = npm.config
  npm.config = { get () {
    return true
  } }
  link([], (err) => {
    npm.config = _config

    t.match(
      err.message,
      /link should never be --global/,
      'should throw an useful error'
    )

    t.end()
  })
})
