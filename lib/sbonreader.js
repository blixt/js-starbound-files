module.exports = SbonReader;

function SbonReader(viewOrBuffer) {
  if (viewOrBuffer instanceof ArrayBuffer) {
    viewOrBuffer = new DataView(viewOrBuffer);
  } else if (!(viewOrBuffer instanceof DataView)) {
    viewOrBuffer = new DataView(viewOrBuffer.buffer);
  }

  this.offset = 0;
  this.view = viewOrBuffer;
}

SbonReader.prototype.readBoolean = function () {
  // XXX: Might want to assert that this is only ever 0x00 or 0x01.
  return !!this.readUint8();
};

/**
 * Reads the specified number of bytes. If the optional noCopy flag is passed
 * in, the returned byte array will reference the original buffer instead of
 * making a copy (faster when you only want to read from the array).
 */
SbonReader.prototype.readBytes = function (count, opt_noCopy) {
  var start = this.view.byteOffset + this.offset;
  this.seek(count, true);

  var range = new Uint8Array(this.view.buffer, start, count);
  if (opt_noCopy) return range;

  var array = new Uint8Array(count);
  array.set(range);
  return array;
};

SbonReader.prototype.readByteString = function (length) {
  return String.fromCharCode.apply(null, this.readBytes(length, true));
};

SbonReader.prototype.readDocument = function () {
  var name = this.readString();

  // This seems to always be 0x01.
  var unknown = this.readUint8();

  // TODO: Not sure if this is signed or not.
  var version = this.readInt32();

  var doc = this.readDynamic();
  doc.__name__ = name;
  doc.__version__ = version;

  return doc;
};

SbonReader.prototype.readDocumentList = function () {
  var length = this.readUintVar();

  var list = [];
  for (var i = 0; i < length; i++) {
    list.push(this.readDocument());
  }
  return list;
};

SbonReader.prototype.readDynamic = function () {
  var type = this.readUint8();
  switch (type) {
    case 1:
      return null;
    case 2:
      return this.readFloat64();
    case 3:
      return this.readBoolean();
    case 4:
      return this.readIntVar();
    case 5:
      return this.readString();
    case 6:
      return this.readList();
    case 7:
      return this.readMap();
  }

  throw new Error('Unknown dynamic type');
};

/**
 * Reads the specified number of bytes and returns them as a string that ends
 * at the first null.
 */
SbonReader.prototype.readFixedString = function (length) {
  var string = this.readByteString(length);
  var nullIndex = string.indexOf('\x00');
  if (nullIndex != -1) {
    return string.substr(0, nullIndex);
  }
  return string;
};

SbonReader.prototype.readFloat32 = function () {
  return this.seek(4, true).view.getFloat32(this.offset - 4);
};

SbonReader.prototype.readFloat64 = function () {
  return this.seek(8, true).view.getFloat64(this.offset - 8);
};

SbonReader.prototype.readInt8 = function () {
  return this.seek(1, true).view.getInt8(this.offset - 1);
};

SbonReader.prototype.readInt16 = function () {
  return this.seek(2, true).view.getInt16(this.offset - 2);
};

SbonReader.prototype.readInt32 = function () {
  return this.seek(4, true).view.getInt32(this.offset - 4);
};

SbonReader.prototype.readIntVar = function () {
  var value = this.readUintVar();

  // Least significant bit represents the sign.
  if (value & 1) {
    return -(value >> 1);
  } else {
    return value >> 1;
  }
};

SbonReader.prototype.readList = function () {
  var length = this.readUintVar();

  var list = [];
  for (var i = 0; i < length; i++) {
    list.push(this.readDynamic());
  }
  return list;
};

SbonReader.prototype.readMap = function () {
  var length = this.readUintVar();

  var map = Object.create(null);
  for (var i = 0; i < length; i++) {
    var key = this.readString();
    map[key] = this.readDynamic();
  }
  return map;
};

SbonReader.prototype.readString = function () {
  var length = this.readUintVar();

  // This is fucking bullshit.
  var raw = this.readByteString(length);
  return decodeURIComponent(escape(raw));
};

SbonReader.prototype.readStringDigestMap = function () {
  // Special structure of string/digest pairs, used by the assets database.
  var length = this.readUintVar();

  var map = Object.create(null), digest, path;
  for (var i = 0; i < length; i++) {
    path = this.readString();
    // Single space character.
    this.seek(1, true);
    digest = this.readBytes(32);
    map[path] = digest;
  }
  return map;
};

SbonReader.prototype.readStringList = function () {
  // Optimized structure that doesn't have a type byte for every item.
  var length = this.readUintVar();

  var list = [];
  for (var i = 0; i < length; i++) {
    list.push(this.readString());
  }
  return list;
};

SbonReader.prototype.readUint8 = function () {
  var value = this.view.getUint8(this.offset);
  this.seek(1, true);
  return value;
};

SbonReader.prototype.readUint16 = function () {
  return this.seek(2, true).view.getUint16(this.offset - 2);
};

SbonReader.prototype.readUint32 = function () {
  return this.seek(4, true).view.getUint32(this.offset - 4);
};

SbonReader.prototype.readUintVar = function () {
  var value = 0;
  while (true) {
    var byte = this.readUint8();
    if ((byte & 128) == 0) {
      return value << 7 | byte;
    }
    value = value << 7 | (byte & 127);
  }
};

SbonReader.prototype.seek = function (offset, opt_relative) {
  var length = this.view.byteCount;
  if (opt_relative) {
    offset = this.offset + offset;
  } else {
    if (offset < 0) {
      offset = length + offset;
    } else {
      offset = offset;
    }
  }

  if (offset < 0 || offset >= length) {
    throw new Error('Out of bounds');
  }

  this.offset = offset;
  return this;
};
