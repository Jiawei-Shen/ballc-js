import filehandle from "generic-filehandle";
const { LocalFile, RemoteFile, BlobFile } = filehandle;
import fetch from "node-fetch";
// import { Buffer } from "buffer";
import { unzip } from "@gmod/bgzf-filehandle";
import BinaryParser from "./binary.js";

//todo: 1. sc==0/1, mc and cov type.

//The length is defined by the bytes number, 1 hex number is 4 bits, 1 byte = 2 hex number = 8 bits.
const MAGIC_LENGTH = 6;
// 2 hex numbers, 1 byte
const VERSION_LENGTH = 1;
// 2 hex numbers, 1 byte
const VERSION_MINOR_LENGTH = 1;
// 2 hex numbers, 1 byte
const SC_LENGTH = 1;
// 8 hex numbers, 4 byte
const I_ASSEMBLY_LENGTH = 4;
// I_assembly
let ASSEMBLY_TEXT_LENGTH;
// 8 hex numbers, 4 byte
const I_TEXT_LENGTH = 4;
// I_assembly
let HEADER_TEXT_LENGTH;
// n_ref 4 hex numbers, 2 byte
const N_REFS_LENGTH = 2;
const L_NAME_LENGTH = 4;
const REF_LEN_LENGTH = 4;
const MC_RECORD_SIZE_SC0 = 10;
const MC_RECORD_SIZE_SC1 = 8;

const MADEUP_HEADER_SIZE = 4096;

class VirtualOffset {
    constructor(blockAddress, blockOffset) {
        this.blockOffset = blockOffset; // < offset of the compressed data block
        this.blockAddress = blockAddress; // < offset into the uncompressed data
    }
    toString() {
        return `${this.blockAddress}:${this.blockOffset}`;
    }
}

class ChrRange {
    constructor(chrRange) {
        const [chromosome, start, end] = this.splitString(chrRange);
        this.chr = chromosome;
        this.start = parseInt(start);
        this.end = parseInt(end);
        this.checkStartEnd(); // Call the function upon instantiation
    }

    checkStartEnd() {
        if (this.start >= this.end) {
            throw new Error("Start value cannot be greater than end value!");
        }
        return 0;
    }

    splitString(chrRange) {
        const parts = chrRange.replace(":", "-").split("-");
        // const {header, positionNow} = viewHeaderBAIIC(hexString);
        // Extract the components
        const chromosome = parts[0];
        const start = parseInt(parts[1]);
        const end = parseInt(parts[2]);
        return [chromosome, start, end];
    }
}

class BAllC {
    constructor(args) {
        this.config = args;
        if (args.path) {
            this.path = args.path;
            this.ballcFileHandle = new LocalFile(this.path);
            this.indexFile = new LocalFile(this.path + ".bci");
        } else if (args.blob) {
            this.ballcFileHandle = new BlobFile(args.blob);
        } else if (args.url) {
            this.url = args.url;
            this.remote = true;
            this.ballcFileHandle = new RemoteFile(this.url, { fetch });
            this.indexUrl = args.url + ".bci";
            this.indexFile = new RemoteFile(this.indexUrl, { fetch });
        } else if (args.indexUrl) {
            this.indexUrl = args.indexUrl;
        } else if (args.cmetaUrl) {
            this.cmetaUrl = args.cmetaUrl;
        } else {
            throw Error("Arguments must include blob, url, or path");
        }
        // this.indexFile = this.indexUrl ? new RemoteFile(this.indexUrl, { fetch }) : null;
        this.header = null;
        this.indexData = null;
        this.initiated = false; // if the file has been initiated, header and index data are loaded
    }

    async query(chrRange) {
        if (!this.initiated) {
            this.header = await this.getHeader();
            this.indexData = await this.getIndexData();
            this.initiated = true;
        }
        const inputChrRange = new ChrRange(chrRange);
        // console.log(`Query BAllC File：${this.ballcPath}, and Chromosome Range: ${chrRange}`);
        checkRangeRef(this.header, inputChrRange);
        const ref_id = this.header["refs"].findIndex((dict) => dict["ref_name"] === inputChrRange.chr);
        const scFlag = this.header["sc"];
        const chunkAddress = queryBGZFIndex(inputChrRange, this.indexData, ref_id);

        // const mc_records_with_repeated_items = await queryBAllCChunks(this.ballcFileHandle, chunkAddress, scFlag);
        // const mc_records = reviseDuplicates(this.header["refs"], mc_records_with_repeated_items, inputChrRange.start, inputChrRange.end);

        //queryChunks function improve the efficiency!
        const mc_records_with_repeated_items = await queryChunks(this.ballcFileHandle, chunkAddress, scFlag);
        const mc_records = reviseDuplicates(
            this.header["refs"],
            mc_records_with_repeated_items,
            inputChrRange.start,
            inputChrRange.end);
        // console.log(mc_records);

        return mc_records;
    }

    async getHeader() {
        const headerBuff = Buffer.alloc(MADEUP_HEADER_SIZE);
        const { headerBytesRead } = await this.ballcFileHandle.read(headerBuff, 0, MADEUP_HEADER_SIZE, 0);
        const ungzipedHeader = await unzip(headerBuff);
        // const header = viewHeaderBAIIC(ungzipedHeader);
        const header = viewHeaderBAIICWithBinaryParser(ungzipedHeader);
        return header;
    }

    async getIndexData() {
        const buf = await this.indexFile.readFile();
        const bytes = await unzip(buf);
        return bytes.toString("hex");
    }
}

function reviseDuplicates(headerRefs, list, start, end) {
    const uniqueList = [];
    list.forEach((item) => {
        if (!hasItem(uniqueList, item) && start <= item.pos && end >= item.pos) {
            // console.log(item['ref_id']);
            item["chr"] = headerRefs[item["ref_id"]]["ref_name"];
            uniqueList.push(item);
        }
    });
    uniqueList.sort((a, b) => a.pos - b.pos);
    return uniqueList;
}

function hasItem(list, currentItem) {
    const index = list.findIndex(item => (currentItem.pos === item.pos) && (currentItem.ref_id === item.ref_id));
    if(index === -1){
        return false
    } else {
        return true
    }
}

function reg_to_bin(beg, end) {
    end -= 1;
    if (beg >> 14 === end >> 14) {
        return ((1 << 15) - 1) / 7 + (beg >> 14);
    }
    if (beg >> 17 === end >> 17) {
        return ((1 << 12) - 1) / 7 + (beg >> 17);
    }
    if (beg >> 20 === end >> 20) {
        return ((1 << 9) - 1) / 7 + (beg >> 20);
    }
    if (beg >> 23 === end >> 23) {
        return ((1 << 6) - 1) / 7 + (beg >> 23);
    }
    if (beg >> 26 === end >> 26) {
        return ((1 << 3) - 1) / 7 + (beg >> 26);
    }
    return 0;
}

function findIndexesByRefName(array, x) {
    return array
        .map((item, index) => (item["ref_name"] === x ? index : -1)) // Map each item to its index if ref_name matches x
        .filter((index) => index !== -1); // Filter out indexes with -1 (indicating no match)
}

function hex_to_int(hex_string) {
    // Ensure the length of the hex string is even
    if (hex_string.length % 2 !== 0) {
        throw new Error("Hex string must have an even length");
    }

    // Split the hex string into pairs of characters
    const hex_pairs = [];
    for (let i = 0; i < hex_string.length; i += 2) {
        hex_pairs.push(hex_string.slice(i, i + 2));
    }

    // Join the reversed pairs and convert to integer
    const reversed_hex_string = hex_pairs.reverse().join("");
    return parseInt(reversed_hex_string, 16);
}

function addTrailingZeros(str, length) {
    while (str.length < length) {
        str += "0";
    }
    return str;
}

function binHexMinusOne(binHex) {
    const binInt = hex_to_int(binHex) - 1;
    return addTrailingZeros(int_to_hex(binInt), binHex.length);
}

function binHexAddOne(binHex) {
    const binInt = hex_to_int(binHex) + 1;
    return addTrailingZeros(int_to_hex(binInt), binHex.length);
}

function int_to_hex(int_string) {
    let hex_string = int_string.toString(16);

    // Ensure the length of the hex string is even
    if (hex_string.length % 2 !== 0) {
        hex_string = "0" + hex_string;
    }

    // Split the hex string into pairs of characters
    const hex_pairs = [];
    for (let i = 0; i < hex_string.length; i += 2) {
        hex_pairs.push(hex_string.slice(i, i + 2));
    }

    // Join the reversed pairs and convert to integer
    const reversed_hex_string = hex_pairs.reverse().join("");
    return reversed_hex_string;
}

function viewHeaderBAIIC(file_content) {
    let header = {};
    let positionNow = 0;
    const magicBuf = file_content.slice(positionNow, positionNow + MAGIC_LENGTH);
    header["magic"] = magicBuf.toString("utf8");
    positionNow += MAGIC_LENGTH;

    const versionBuf = file_content.slice(positionNow, positionNow + VERSION_LENGTH);
    header["version"] = versionBuf[0];
    positionNow += VERSION_LENGTH;

    const version_minorBuf = file_content.slice(positionNow, positionNow + VERSION_MINOR_LENGTH);
    header["version_minor"] = version_minorBuf[0];
    positionNow += VERSION_MINOR_LENGTH;

    const scBuf = file_content.slice(positionNow, positionNow + SC_LENGTH);
    header["sc"] = scBuf[0];
    positionNow += SC_LENGTH;

    const I_assemblyBuf = file_content.slice(positionNow, positionNow + I_ASSEMBLY_LENGTH);
    header["I_assembly"] = I_assemblyBuf.readUInt32LE();
    positionNow += I_ASSEMBLY_LENGTH;

    const assembly_textBuf = file_content.slice(positionNow, positionNow + header["I_assembly"]);
    header["assembly_text"] = assembly_textBuf.toString("utf8");
    positionNow += header["I_assembly"];

    const I_textBuf = file_content.slice(positionNow, positionNow + I_TEXT_LENGTH);
    header["I_text"] = I_textBuf.readUInt32LE();
    positionNow += I_TEXT_LENGTH;

    const header_textBuf = file_content.slice(positionNow, positionNow + header["I_text"]);
    header["header_text"] = header_textBuf.toString("utf8");
    positionNow += header["I_text"];

    const n_refsBuf = file_content.slice(positionNow, positionNow + N_REFS_LENGTH);
    header["n_refs"] = n_refsBuf.readUInt16LE();
    positionNow += N_REFS_LENGTH;

    let refs = [];
    for (let i = 0; i < header["n_refs"]; i++) {
        const ref = {};
        ref["l_name"] = file_content.slice(positionNow, positionNow + L_NAME_LENGTH).readUInt32LE();
        positionNow += L_NAME_LENGTH;
        ref["ref_name"] = file_content.slice(positionNow, positionNow + ref["l_name"]).toString("utf8");
        positionNow += ref["l_name"];
        ref["ref_len"] = file_content.slice(positionNow, positionNow + REF_LEN_LENGTH).readUInt32LE();
        positionNow += REF_LEN_LENGTH;
        refs.push(ref);
    }
    header["refs"] = refs;

    return header;
}

function viewHeaderBAIICWithBinaryParser(file_content) {
    let header = {};
    const parser = new BinaryParser(new DataView(file_content.buffer));
    header["magic"] = parser.getFixedLengthString(MAGIC_LENGTH);
    header["version"] = parser.getByte();
    header["version_minor"] = parser.getByte();
    header["sc"] = parser.getByte();
    header["I_assembly"] = parser.getUInt();
    header["assembly_text"] = parser.getFixedLengthString(header["I_assembly"]);
    header["I_text"] = parser.getUInt();
    header["header_text"] = parser.getFixedLengthString(header["I_text"]);
    header["n_refs"] = parser.getUShort();
    let refs = [];
    for (let i = 0; i < header["n_refs"]; i++) {
        const ref = {};
        ref["l_name"] = parser.getUInt();
        ref["ref_name"] = parser.getFixedLengthString(ref["l_name"]);
        ref["ref_len"] = parser.getUInt();
        refs.push(ref);
    }
    header["refs"] = refs;
    // console.log(header);
    return header;
}

function BintoVirtualOffset(hexString, pos) {
    const chunkStartBin = hexString.substring(pos + 12, pos + 28);
    const chunkStart_block_offset = hex_to_int(chunkStartBin.substring(0, 4));
    const chunkStart_block_address = hex_to_int(chunkStartBin.substring(4, 16));
    const chunkStart = new VirtualOffset(chunkStart_block_address, chunkStart_block_offset);

    const chunkEndBin = hexString.substring(pos + 28, pos + 44);
    const chunkEnd_block_offset = hex_to_int(chunkEndBin.substring(0, 4));
    const chunkEnd_block_address = hex_to_int(chunkEndBin.substring(4, 16));
    const chunkEnd = new VirtualOffset(chunkEnd_block_address, chunkEnd_block_offset);

    return { chunkStart: chunkStart, chunkEnd: chunkEnd };
}

function queryBGZFIndex(chrRange, hexString, refID) {
    const startBin = reg_to_bin(chrRange.start, chrRange.start + 1);
    const endBin = reg_to_bin(chrRange.end, chrRange.end + 1);

    let startBinHex = addTrailingZeros(int_to_hex(startBin), 8);
    let endBinHex = addTrailingZeros(int_to_hex(endBin), 8);
    const refIDHex = addTrailingZeros(int_to_hex(refID), 4);

    let startPos = -1;
    while (startPos == -1) {
        startPos = hexString.indexOf(`${refIDHex}${startBinHex}`);
        startBinHex = binHexAddOne(startBinHex);
    }
    startBinHex = binHexMinusOne(startBinHex);

    let endPos = -1;
    while (endPos == -1) {
        endPos = hexString.indexOf(`${refIDHex}${endBinHex}`);
        endBinHex = binHexMinusOne(endBinHex);
    }
    endBinHex = binHexAddOne(endBinHex);
    // let testPos = hexString.indexOf(`${refIDHex}${startBinHex}`);
    let chunksPos = [];
    let chunks = [];
    // let blockAddressSet = new Set();
    for (
        let theBinHex = startBinHex;
        hex_to_int(theBinHex) <= hex_to_int(endBinHex);
        theBinHex = binHexAddOne(theBinHex)
    ) {
        const thePos = hexString.indexOf(`${refIDHex}${theBinHex}`);
        if (thePos != -1) {
            const vOff = BintoVirtualOffset(hexString, thePos);
            chunksPos.push(thePos);
            chunks.push(vOff);
            // blockAddressSet.add(vOff.blockAddress);
        }
    }
    return chunks;
}

async function queryBAllCChunks(fileHandle, chunks, scFlag) {
    let mc_records_with_repeated_items = [];
    await Promise.all(
        chunks.map(async (chunk, index) => {
            const chunk_mc_records = await queryChunkNew(fileHandle, chunk, scFlag);
            mc_records_with_repeated_items.push(...chunk_mc_records);
        })
    );
    return mc_records_with_repeated_items;
}

function arrangeBAllCChunks(chunks) {
    let chunkSet = new Set();
    chunks.forEach(item => {
        chunkSet.add(item['chunkStart'].blockAddress);
        chunkSet.add(item['chunkEnd'].blockAddress);
    });
    let sortedArray = Array.from(chunkSet).sort((a, b) => a - b);
    return sortedArray;
}

// async function queryChunk(fileHandle, blockAddress, startOffset, endOffset) {
//     // endOffset += 2 * MC_RECORD_SIZE;
//     endOffset = (endOffset + 2 * MC_RECORD_SIZE > 65535) ? 65535 : endOffset + 2 * MC_RECORD_SIZE;
//     const chunkBuf = Buffer.allocUnsafe(endOffset);
//     const { allBytesRead } = await fileHandle.read(chunkBuf, 0, endOffset, blockAddress);
//     const unzippedChunk = await unzip(chunkBuf);
//     const chunk = unzippedChunk.slice(startOffset, endOffset);
//     const leng_mc_cov = 2;
//     let mc_records = [];
//     for (let positionStartNow = 0; positionStartNow < chunk.length - MC_RECORD_SIZE; ) {
//         let mc_record = {};
//         mc_record["pos"] = chunk.slice(positionStartNow, positionStartNow + 4).readUInt32LE();
//         positionStartNow += 4;
//         mc_record["ref_id"] = chunk.slice(positionStartNow, positionStartNow + 2).readUInt16LE();
//         positionStartNow += 2;
//         mc_record["mc"] = chunk.slice(positionStartNow, positionStartNow + leng_mc_cov).readUInt16LE();
//         positionStartNow += leng_mc_cov;
//         mc_record["cov"] = chunk.slice(positionStartNow, positionStartNow + leng_mc_cov).readUInt16LE();
//         positionStartNow += leng_mc_cov;
//         mc_records.push(mc_record);
//     }
//     return mc_records;
// }

async function queryChunkWithBinaryParser(fileHandle, blockAddress, startOffset, endOffset, scFlag) {
    let MC_RECORD_SIZE;
    if(scFlag == 0){
        MC_RECORD_SIZE = MC_RECORD_SIZE_SC0
    } else { //sc == 1
        MC_RECORD_SIZE = MC_RECORD_SIZE_SC1
    }
    endOffset += 2 * MC_RECORD_SIZE;
    const chunkBuf = Buffer.alloc(endOffset);
    const { allBytesRead } = await fileHandle.read(chunkBuf, 0, endOffset, blockAddress);
    const unzippedChunk = await unzip(chunkBuf);
    const chunk = unzippedChunk.subarray(startOffset, endOffset);
    // const parser = new BinaryParser(new DataView(chunk.buffer));

    // Modify the buffer assignment.
    const subChunkBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    const parser = new BinaryParser(new DataView(subChunkBuffer));

    // Create a new Buffer without slice function.
    // const slicedBuffer = Buffer.alloc(endOffset - startOffset);
    // chunk.copy(slicedBuffer, 0, chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    // const parser = new BinaryParser(new DataView(slicedBuffer.buffer, slicedBuffer.byteOffset, slicedBuffer.byteLength));

    let mc_records = [];
    for (
        let positionStartNow = 0;
        positionStartNow <= chunk.length - MC_RECORD_SIZE;
        positionStartNow += MC_RECORD_SIZE
    ) {
        let mc_record = {};
        mc_record["pos"] = parser.getUInt();
        mc_record["ref_id"] = parser.getUShort();
        // mc_record["mc"] = parser.getByte();
        // mc_record["cov"] = parser.getByte();

        // ??This is weired, the scFlag is opposite to the documentation.
        if (scFlag === 1){
            mc_record["mc"] = parser.getByte();
            mc_record["cov"] = parser.getByte();
        } else { // sc == 1
            mc_record["mc"] = parser.getUShort();
            mc_record["cov"] = parser.getUShort();
        }
        // console.log(mc_record);
        mc_records.push(mc_record);
    }
    return mc_records;
}

async function queryChunks(fileHandle, chunks, scFlag) {
    let MC_RECORD_SIZE;
    if(scFlag == 0){
        MC_RECORD_SIZE = MC_RECORD_SIZE_SC0
    } else { //sc == 1
        MC_RECORD_SIZE = MC_RECORD_SIZE_SC1
    }
    let mc_records_with_repeated_items = [];
    const blocksAddressArray = arrangeBAllCChunks(chunks);
    const startBlockOffset = chunks[0]['chunkStart'].blockOffset;
    const endBlockOffset = chunks[chunks.length - 1]['chunkEnd'].blockOffset;

    if(blocksAddressArray.length === 1){
        const mc_records_chunk = await queryChunkWithBinaryParser(
            fileHandle,
            blocksAddressArray[0],
            startBlockOffset,
            endBlockOffset,
            scFlag
        );
        mc_records_with_repeated_items.push(...mc_records_chunk);
    } else if(blocksAddressArray.length === 2){
        const mc_records_chunk_begin = await queryChunkWithBinaryParser(
            fileHandle,
            blocksAddressArray[0],
            startBlockOffset,
            65535,
            scFlag
        );
        mc_records_with_repeated_items.push(...mc_records_chunk_begin);

        const mc_records_chunk_end = await queryChunkWithBinaryParser(
            fileHandle,
            blocksAddressArray[1],
            endBlockOffset % MC_RECORD_SIZE,
            endBlockOffset,
            scFlag
        );
        mc_records_with_repeated_items.push(...mc_records_chunk_end);
    } else if(blocksAddressArray.length > 2) {
        const mc_records_chunk_begin = await queryChunkWithBinaryParser(
            fileHandle,
            blocksAddressArray[0],
            startBlockOffset,
            65535,
            scFlag
        );
        mc_records_with_repeated_items.push(...mc_records_chunk_begin);

        const chunksMiddle = blocksAddressArray.slice(1, -1);
        await Promise.all(
            chunksMiddle.map(async (chunk, index) => {
                const mc_records_chunk_middle = await queryChunkWithBinaryParser(
                    fileHandle,
                    chunk,
                    endBlockOffset % MC_RECORD_SIZE,
                    65535,
                    scFlag
                );
                mc_records_with_repeated_items.push(...mc_records_chunk_middle);
            })
        );

        const mc_records_chunk_end = await queryChunkWithBinaryParser(
            fileHandle,
            blocksAddressArray[blocksAddressArray.length - 1],
            endBlockOffset % MC_RECORD_SIZE,
            endBlockOffset,
            scFlag
        );
        mc_records_with_repeated_items.push(...mc_records_chunk_end);
    } else {
        await Promise.all(
            chunks.map(async (chunk, index) => {
                const chunk_mc_records = await queryChunkNew(fileHandle, chunk, scFlag);
                mc_records_with_repeated_items.push(...chunk_mc_records);
            })
        );
    }

    return mc_records_with_repeated_items;
}

async function queryChunkNew(fileHandle, chunk, scFlag) {
    const startBlock = chunk["chunkStart"];
    const endBlock = chunk["chunkEnd"];
    let mc_records = [];
    if (startBlock["blockAddress"] == endBlock["blockAddress"]) { //Only query one block
        const mc_records_chunk = await queryChunkWithBinaryParser(
            fileHandle,
            startBlock["blockAddress"],
            startBlock["blockOffset"],
            endBlock["blockOffset"],
            scFlag
        );
        mc_records.push(...mc_records_chunk);
    } else {
        const chunkStart_mc_records = await queryChunkWithBinaryParser( //Query two blocks
            fileHandle,
            startBlock["blockAddress"],
            startBlock["blockOffset"],
            65535,
            scFlag
        );
        mc_records.push(...chunkStart_mc_records);
        const chunkEnd_mc_records = await queryChunkWithBinaryParser(
            fileHandle,
            endBlock["blockAddress"],
            endBlock["blockOffset"] % MC_RECORD_SIZE,
            endBlock["blockOffset"],
            scFlag
        );
        mc_records.push(...chunkEnd_mc_records);
    }
    return mc_records;
}

function checkRangeRef(header, inputChrRange) {
    const ref_id = header["refs"].findIndex((dict) => dict["ref_name"] === inputChrRange.chr);
    if (ref_id === -1) {
        throw new Error("The chromosome was not found!");
    }
    const ref = header["refs"].find((item) => item.ref_name === inputChrRange.chr);
    if (inputChrRange.end > ref["ref_len"]) {
        throw new Error("The query range is outside of the reference size!");
    }
    return 0;
}

export { BAllC };
