/*
 * BitCodec : reader of the Motion Twin "base64 bit codec" (ext.util.MTBitcodec
 * in the AS2 code, BitCodec in the OCaml generator).
 *
 * The level data is a stream of unsigned integers of variable bit sizes,
 * written most significant bit first and packed 6 bits per character with the
 * alphabet below. The alphabet was not in the sources : it was recovered by
 * decoding all the rooms of ../dungeon/*.txt with every plausible ordering
 * (only this one decodes all 302 rooms).
 */
"use strict";

MB2.BitCodec = class {

	constructor(str) {
		this.data = str || "";
		this.pos = 0;     // next character to read
		this.nbits = 0;   // number of bits available in the buffer
		this.bits = 0;    // bit buffer
		this.error = false;
	}

	/** Reads an unsigned integer of n bits (n <= 18). Sets `error` at the end of the data. */
	read(n) {
		while (this.nbits < n) {
			const c = MB2.BitCodec.CHARS.indexOf(this.data.charAt(this.pos++));
			if (c < 0) {
				this.error = true;
				return 0;
			}
			this.bits = ((this.bits << 6) | c) & 0xFFFFFF;
			this.nbits += 6;
		}
		this.nbits -= n;
		return (this.bits >> this.nbits) & ((1 << n) - 1);
	}
};

MB2.BitCodec.CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
