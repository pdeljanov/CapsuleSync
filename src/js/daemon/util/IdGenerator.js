module.exports =
function(length) {
    // http://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript/14944262#14944262
    return Array.apply(0, Array(length)).map(function() {
        return (function(charset){
            return charset.charAt(Math.floor(Math.random() * charset.length))
        }('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'));
    }).join('');
};
