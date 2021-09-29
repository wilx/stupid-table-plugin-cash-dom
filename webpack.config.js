
const path = require('path');

module.exports = {
    target: 'web',
    mode: 'production',
    entry: {
        index: path.join(__dirname, 'src', 'stupidtable.js')
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'stupidtable.js',
        library: 'stupidtable',
        libraryTarget: 'umd',
        globalObject: 'this',
        umdNamedDefine: true
    },
    module: {
        rules: [
            {
                test: /\.m?js$/,
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            [
                                '@babel/preset-env',
                                {
                                    debug: true,
                                    useBuiltIns: 'usage',
                                    corejs: '3',
                                    shippedProposals: true
                                }
                            ]
                        ],
                        plugins: [
                            // 'babel-plugin-minify-constant-folding',
                            'babel-plugin-minify-guarded-expressions',
                            ['babel-plugin-transform-remove-undefined', {
                                tdz: true
                            }],
                            'babel-plugin-transform-simplify-comparison-operators',
                            ['babel-plugin-minify-dead-code-elimination', {
                                tdz: true
                            }]
                        ]
                    }
                }
            }
        ]
    },
    stats: {
        colors: true
    },
    devtool: 'source-map',
    optimization: {
        minimize: false
    },
    resolve: {
        alias: {
            node_modules: path.join(__dirname, 'node_modules')
        }
    },
    externals: {
        'cash-dom': 'cash-dom'
    }
};
