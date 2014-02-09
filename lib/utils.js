exports.getBufferFromFile = function (file, start, end, callback) {
  var blob = file.slice(start, end);
  var reader = new FileReader();
  reader.onloadend = function () {
    callback(reader.error, reader.result);
  };
  reader.readAsArrayBuffer(blob);
};
