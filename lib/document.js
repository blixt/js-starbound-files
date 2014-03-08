var SbonReader = require('./sbonreader');

module.exports = Document;

var SIGNATURE = 'SBVJ01';

var fileReader = new FileReaderSync();

// TODO: Starbound calls this "versioned JSON", so might refactor naming later.
function Document(data) {
  this.data = data;
}

Document.open = function (file) {
  var buffer = fileReader.readAsArrayBuffer(file);

  var reader = new SbonReader(buffer);
  if (reader.readByteString(SIGNATURE.length) != SIGNATURE) {
    throw new Error('Invalid SBVJ01 file');
  }

  var data = reader.readDocument();
  return new Document(data);
};
