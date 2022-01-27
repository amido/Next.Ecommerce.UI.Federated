const flexbugsPlugin = require('postcss-flexbugs-fixes')
const postCssPresetEnv = require('postcss-preset-env')
const getCSSModuleLocalIdent = require('react-ssr-dev-utils/getCSSModuleLocalIdent')
const nodeExternals = require('webpack-node-externals')

const paths = require('../paths')

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false'

const imageInlineSizeLimit = 10000

// style files regexes
const cssRegex = /\.css$/
const cssModuleRegex = /\.module\.css$/
const sassRegex = /\.(scss|sass)$/
const sassModuleRegex = /\.module\.(scss|sass)$/

const baseLoaders = (webpackEnv, appEnv) => {
  const isEnvProduction = webpackEnv === 'production'
  const isEnvServer = appEnv === 'server'

  return [
    // Process application JS with Babel.
    // The preset includes JSX, Flow, TypeScript, and some ESnext features.
    {
      test: /\.(js|mjs|jsx|ts|tsx)$/,
      include: paths.appSrc,
      loader: require.resolve('babel-loader'),
      options: {
        customize: require.resolve('babel-preset-react-app/webpack-overrides'),

        plugins: [
          // Add support for styled-components ssr
          require.resolve('babel-plugin-styled-components'),
          // Transform dynamic import to require for server
          isEnvServer && require.resolve('babel-plugin-dynamic-import-node'),
          [
            require.resolve('babel-plugin-named-asset-import'),
            {
              loaderMap: {
                svg: {
                  ReactComponent: '@svgr/webpack?-svgo,+titleProp,+ref![path]',
                },
              },
            },
          ],
        ].filter(Boolean),
        // This is a feature of `babel-loader` for webpack (not Babel itself).
        // It enables caching results in ./node_modules/.cache/babel-loader/
        // directory for faster rebuilds.
        cacheDirectory: true,
        cacheCompression: isEnvProduction,
        compact: isEnvProduction,
      },
    },
    // Process any JS outside of the app with Babel.
    // Unlike the application JS, we only compile the standard ES features.
    {
      test: /\.(js|mjs)$/,
      exclude: /@babel(?:\/|\\{1,2})runtime/,
      loader: require.resolve('babel-loader'),
      options: {
        babelrc: false,
        configFile: false,
        compact: false,
        presets: [
          [
            require.resolve('babel-preset-react-app/dependencies'),
            { helpers: true },
          ],
        ],
        cacheDirectory: true,
        cacheCompression: isEnvProduction,

        // If an error happens in a package, it's possible to be
        // because it was compiled. Thus, we don't want the browser
        // debugger to show the original code. Instead, the code
        // being evaluated would be much more helpful.
        sourceMaps: false,
      },
    },
  ]
}

const serverLoaders = (webpackEnv) => {
  const isEnvProduction = webpackEnv === 'production'

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        loader: require.resolve('postcss-loader'),
        options: {
          ident: 'postcss',
          plugins: () => [
            flexbugsPlugin,
            postCssPresetEnv({
              autoprefixer: {
                flexbox: 'no-2009',
              },
              stage: 3,
            }),
          ],
        },
      },
    ].filter(Boolean)
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: {
            sourceMap: isEnvProduction && shouldUseSourceMap,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: {
            sourceMap: true,
          },
        }
      )
    }
    return loaders
  }

  return [
    {
      test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
      loader: require.resolve('url-loader'),
      options: {
        limit: imageInlineSizeLimit,
        name: 'static/media/[name].[hash:8].[ext]',
      },
    },
    {
      test: cssRegex,
      exclude: cssModuleRegex,
      loader: require.resolve('css-loader'),
    },
    {
      test: cssModuleRegex,
      use: getStyleLoaders({
        importLoaders: 1,
        modules: true,
        getLocalIdent: getCSSModuleLocalIdent,
      }),
    },
    {
      test: sassRegex,
      exclude: sassModuleRegex,
      use: getStyleLoaders(
        {
          importLoaders: 2,
        },
        'sass-loader'
      ),
      sideEffects: true,
    },
    {
      test: sassModuleRegex,
      use: getStyleLoaders(
        {
          importLoaders: 2,
          modules: true,
          getLocalIdent: getCSSModuleLocalIdent,
        },
        'sass-loader'
      ),
    },
    {
      loader: require.resolve('file-loader'),
      exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
      options: {
        name: 'static/media/[name].[hash:8].[ext]',
        emitFile: false,
      },
    },
  ]
}

module.exports = function (webpackEnv) {
  return {
    target: 'node',
    entry: paths.serverTs,
    output: {
      path: paths.appBuild,
      filename: 'server.js',
      library: { type: 'commonjs2' },
    },
    externals: [nodeExternals()],
    resolve: {
      modules: ['node_modules'],
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.(js|mjs|ts)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
          },
        },
        {
          oneOf: [...baseLoaders(webpackEnv), ...serverLoaders(webpackEnv)],
        },
      ],
    },
  }
}
