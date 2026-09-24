/**
 * Reader of the Motion Twin "base64 bit codec" used by the level data.
 *
 * The data is a stream of unsigned integers of variable bit sizes, written
 * most significant bit first, packed 6 bits per character with the alphabet
 * below. (The alphabet was not in the sources : it is the only ordering that
 * decodes all the rooms of ../dungeon/*.txt.)
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

export class BitReader {

	constructor(text) {
		this.text = text || "";
		this.pos = 0;       // next character
		this.nbits = 0;     // bits available in the buffer
		this.bits = 0;
		this.ended = false; // set when reading past the end
	}

	/** Reads an unsigned integer of n bits (n <= 18). */
	read(n) {
		while (this.nbits < n) {
			const c = ALPHABET.indexOf(this.text.charAt(this.pos++));
			if (c < 0) {
				this.ended = true;
				return 0;
			}
			this.bits = ((this.bits << 6) | c) & 0xFFFFFF;
			this.nbits += 6;
		}
		this.nbits -= n;
		return (this.bits >> this.nbits) & ((1 << n) - 1);
	}
}
