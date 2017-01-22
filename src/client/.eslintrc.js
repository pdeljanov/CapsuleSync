module.exports = {
    "extends": "airbnb-base",
    "plugins": [
        "import"
    ],
    "env": {
        "node": true
    },
    "rules" : {
        "indent": ["error", 4],
        "no-underscore-dangle": [ "off" ],
        "object-shorthand": ["error", "consistent"],
        "key-spacing": ["off"],
        "key-spacing": ["error", { "align": "value" }],
        "strict": ["error", "global"],
        "brace-style": ["error", "stroustrup", { "allowSingleLine": true }]
    }
};
