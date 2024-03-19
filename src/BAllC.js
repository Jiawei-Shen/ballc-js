// const zlib = require('zlib');
// const fs = require('fs');
// const { LocalFile } = require('generic-filehandle');
// const { Buffer } = require('buffer');
// const {unzip} = require('@gmod/bgzf-filehandle')

import fs from "fs";
import zlib from 'zlib';
// import 'generic-filehandle';
import localfile from 'generic-filehandle';
const { LocalFile } = localfile;
import { Buffer } from 'buffer';
import { unzip } from '@gmod/bgzf-filehandle';

//todo: 1. sc==0/1, mc and cov type.
//todo: 2. fetch the remote file.

//The length is defined by the bytes number, 1 hex number is 4 bits, 1 byte = 2 hex number = 8 bits.
const MAGIC_LENGTH = 6;
// 2 hex numbers, 1 byte
const VERSION_LENGTH =1;
// 2 hex numbers, 1 byte
const VERSION_MINOR_LENGTH = 1;
// 2 hex numbers, 1 byte
const SC_LENGTH = 1;
// 8 hex numbers, 4 byte
const I_ASSEMBLY_LENGTH = 4
// I_assembly
let ASSEMBLY_TEXT_LENGTH;
// 8 hex numbers, 4 byte
const I_TEXT_LENGTH = 4;
// I_assembly
let HEADER_TEXT_LENGTH;
// n_ref 4 hex numbers, 2 byte
const N_REFS_LENGTH = 2
const L_NAME_LENGTH = 4
const REF_LEN_LENGTH = 4
const MC_RECORD_SIZE = 10

class VirtualOffset {
    constructor(blockAddress, blockOffset) {
        this.blockOffset = blockOffset // < offset of the compressed data block
        this.blockAddress = blockAddress // < offset into the uncompressed data
    }
    toString() {
        return `${this.blockAddress}:${this.blockOffset}`
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
        const parts = chrRange.replace(':', '-').split('-');
        // const {header, positionNow} = viewHeaderBAIIC(hexString);
        // Extract the components
        const chromosome = parts[0];
        const start = parseInt(parts[1]);
        const end = parseInt(parts[2]);

        return [chromosome, start, end]
    }
}

class BAllC {
    constructor(path) {
        this.ballcPath = path;
        this.bciPath = path+'.bci';
        this.ballcFileHandle = new LocalFile(this.ballcPath);
        if(!fileExists(path+'.bci')){
            throw new Error("Index not found!");
        }
        if(!fileExists(path)){
            throw new Error("BAllC file not found!");
        }
    }

    async query(chrRange) {
        const inputChrRange = new ChrRange(chrRange);
        // const fileHandle = new LocalFile(this.ballcPath);

        console.log(`Query BAllC File：${this.ballcPath}, and Chromosome Range: ${chrRange}`);
        const header = await this.getHeader();
        checkRangeRef(header, inputChrRange);
        const ref_id = header['refs'].findIndex(dict => dict['ref_name'] === inputChrRange.chr);
        const chunkAddress = await queryBGZFIndex(this.bciPath, inputChrRange, ref_id);
        const mc_records_with_repeated_items = await queryBAllCChunks(this.ballcFileHandle, chunkAddress);
        const mc_records = reviseDuplicates(mc_records_with_repeated_items, inputChrRange.start, inputChrRange.end);
        console.log(mc_records);
        return mc_records
    }

    async getHeader(){
        const headerBuff = Buffer.allocUnsafe(20000);
        const { headerBytesRead } = await this.ballcFileHandle.read(headerBuff, 0, 20000, 0);
        const ungzipedHeader = await unzip(headerBuff);
        const header = viewHeaderBAIIC(ungzipedHeader);

        return header
    }
}

function fileExists(filePath) {
    try {
        // Check if the file exists
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch (err) {
        // If the file does not exist or cannot be accessed, return false
        return false;
    }
}

function reviseDuplicates(list, start, end) {
    const uniqueList = [];
    list.forEach(item => {
        if (!hasItem(uniqueList, item) && (start <= item.pos && end >= item.pos)) {
            uniqueList.push(item);
        }
    });
    uniqueList.sort((a, b) => a.pos - b.pos);
    return uniqueList;
}

function hasItem(list, item) {
    return list.some(element => isEqual(element, item));
}

function isEqual(obj1, obj2) {
    // Compare properties of obj1 and obj2
    // Assuming both objects have the same keys
    for (let key in obj1) {
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }
    return true;
}

function reg_to_bin(beg, end) {
    end -= 1;
    if ((beg >> 14) === (end >> 14)) {
        return ((1 << 15) - 1) / 7 + (beg >> 14);
    }
    if ((beg >> 17) === (end >> 17)) {
        return ((1 << 12) - 1) / 7 + (beg >> 17);
    }
    if ((beg >> 20) === (end >> 20)) {
        return ((1 << 9) - 1) / 7 + (beg >> 20);
    }
    if ((beg >> 23) === (end >> 23)) {
        return ((1 << 6) - 1) / 7 + (beg >> 23);
    }
    if ((beg >> 26) === (end >> 26)) {
        return ((1 << 3) - 1) / 7 + (beg >> 26);
    }
    return 0;
}

function findIndexesByRefName(array, x) {
    return array
        .map((item, index) => item['ref_name'] === x ? index : -1) // Map each item to its index if ref_name matches x
        .filter(index => index !== -1); // Filter out indexes with -1 (indicating no match)
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
    const reversed_hex_string = hex_pairs.reverse().join('');
    return parseInt(reversed_hex_string, 16);
}

function addTrailingZeros(str, length) {
    while (str.length < length) {
        str += '0';
    }
    return str;
}

function binHexMinusOne(binHex) {
    const binInt = hex_to_int(binHex) - 1;
    return addTrailingZeros(int_to_hex(binInt), binHex.length)
}

function binHexAddOne(binHex) {
    const binInt = hex_to_int(binHex) + 1;
    return addTrailingZeros(int_to_hex(binInt), binHex.length)
}

function int_to_hex(int_string) {
    let hex_string = int_string.toString(16);

    // Ensure the length of the hex string is even
    if (hex_string.length % 2 !== 0) {
        hex_string = '0' + hex_string;
    }

    // Split the hex string into pairs of characters
    const hex_pairs = [];
    for (let i = 0; i < hex_string.length; i += 2) {
        hex_pairs.push(hex_string.slice(i, i + 2));
    }

    // Join the reversed pairs and convert to integer
    const reversed_hex_string = hex_pairs.reverse().join('');
    return reversed_hex_string;
}

function hex_to_utf8(hex_string) {
    // Ensure the length of the hex string is even
    if (hex_string.length % 2 !== 0) {
        throw new Error("Hex string must have an even length");
    }

    // Split the hex string into pairs of characters
    const hex_pairs = [];
    for (let i = 0; i < hex_string.length; i += 2) {
        hex_pairs.push(hex_string.slice(i, i + 2));
    }

    // Convert each pair to a character and join them to form a string
    const utf8_string = hex_pairs.map(hex_pair => String.fromCharCode(parseInt(hex_pair, 16))).join('');

    return utf8_string;
}

function viewHeaderBAIIC(file_content){
    let header = {};
    let positionNow = 0;
    const magicBuf = file_content.slice(positionNow, positionNow+MAGIC_LENGTH);
    header['magic'] = magicBuf.toString('utf8');
    positionNow += MAGIC_LENGTH;

    const versionBuf = file_content.slice(positionNow, positionNow+VERSION_LENGTH);
    header['version'] = versionBuf[0];
    positionNow += VERSION_LENGTH

    const version_minorBuf = file_content.slice(positionNow, positionNow+VERSION_MINOR_LENGTH);
    header['version_minor'] = version_minorBuf[0];
    positionNow += VERSION_MINOR_LENGTH

    const scBuf = file_content.slice(positionNow, positionNow+SC_LENGTH);
    header['sc'] = scBuf[0];
    positionNow += SC_LENGTH

    const I_assemblyBuf = file_content.slice(positionNow, positionNow+I_ASSEMBLY_LENGTH);
    header['I_assembly'] = I_assemblyBuf.readUInt32LE();
    positionNow += I_ASSEMBLY_LENGTH

    const assembly_textBuf = file_content.slice(positionNow, positionNow+header['I_assembly']);
    header['assembly_text'] = assembly_textBuf.toString('utf8');
    positionNow += header['I_assembly']

    const I_textBuf = file_content.slice(positionNow, positionNow+I_TEXT_LENGTH);
    header['I_text'] = I_textBuf.readUInt32LE();
    positionNow += I_TEXT_LENGTH

    const header_textBuf = file_content.slice(positionNow, positionNow+header['I_text']);
    header['header_text'] = header_textBuf.toString('utf8');
    positionNow += header['I_text']

    const n_refsBuf = file_content.slice(positionNow, positionNow+N_REFS_LENGTH);
    header['n_refs'] = n_refsBuf.readUInt16LE();
    positionNow += N_REFS_LENGTH

    let refs = [];
    for (let i = 0; i < header['n_refs']; i++) {
        const ref = {};
        ref['l_name'] = file_content.slice(positionNow, positionNow + L_NAME_LENGTH).readUInt32LE();
        positionNow += L_NAME_LENGTH;
        ref['ref_name'] = file_content.slice(positionNow, positionNow + ref['l_name']).toString('utf8');
        positionNow += ref['l_name'];
        ref['ref_len'] = file_content.slice(positionNow, positionNow + REF_LEN_LENGTH).readUInt32LE();
        positionNow += REF_LEN_LENGTH;
        refs.push(ref);
    }
    header['refs'] = refs

    return header
}

async function queryBGZFIndex(filePath, chrRange, ref_id) {
    let endFlag = false;
    return new Promise((resolve, reject) => {
        // console.log(filePath);
        const inputStream = fs.createReadStream(filePath);
        const gzipStream = zlib.createGunzip();
        let hexString = '';

        // Pipe the input stream (BGZF file) into the gzip stream
        inputStream.pipe(gzipStream);
        // const outputStream = fs.createWriteStream('output_test.txt');
        // gzipStream.pipe(outputStream);

        // Handle data events from the gzip stream
        gzipStream.on('data', (data) => {
            // Process the decompressed data
            // console.log(data);
            hexString += data.toString('hex');
            // outputStream.write(hexString);
        });

        // Handle errors
        gzipStream.on('error', (err) => {
            console.error('Error reading BGZF file:', err);
        });

        let chunk;
        // Handle end of file
        gzipStream.on('end', () => {
            chunk = queryBAIIC(chrRange, hexString, ref_id)
            // console.log('Finished reading BGZF file.', chunk);
            resolve(chunk);
        });
    });
}

function BintoVirtualOffset(hexString, pos){
    const chunkStartBin = hexString.substring(pos + 12, pos + 28);
    const chunkStart_block_offset = hex_to_int(chunkStartBin.substring(0,4));
    const chunkStart_block_address = hex_to_int(chunkStartBin.substring(4,16));
    const chunkStart = new VirtualOffset(chunkStart_block_address, chunkStart_block_offset);

    const chunkEndBin = hexString.substring(pos + 28, pos + 44);
    const chunkEnd_block_offset = hex_to_int(chunkEndBin.substring(0,4));
    const chunkEnd_block_address = hex_to_int(chunkEndBin.substring(4,16));
    const chunkEnd = new VirtualOffset(chunkEnd_block_address, chunkEnd_block_offset);

    return {'chunkStart': chunkStart, 'chunkEnd': chunkEnd}
}

function queryBAIIC(chrRange,hexString, refID){
    const startBin = reg_to_bin(chrRange.start, chrRange.start+1);
    const endBin = reg_to_bin(chrRange.end, chrRange.end+1);

    let startBinHex = addTrailingZeros(int_to_hex(startBin), 8);
    let endBinHex = addTrailingZeros(int_to_hex(endBin), 8);
    const refIDHex = addTrailingZeros(int_to_hex(refID), 4);

    let startPos = -1;
    while(startPos == -1){
        startPos = hexString.indexOf(`${refIDHex}${startBinHex}`);
        startBinHex = binHexAddOne(startBinHex);
    }
    startBinHex = binHexMinusOne(startBinHex);

    let endPos = -1;
    while(endPos == -1){
        endPos = hexString.indexOf(`${refIDHex}${endBinHex}`);
        endBinHex = binHexMinusOne(endBinHex);
    }
    endBinHex = binHexAddOne(endBinHex);
    // let testPos = hexString.indexOf(`${refIDHex}${startBinHex}`);
    let chunksPos = [];
    let chunks = [];
    // let blockAddressSet = new Set();
    for(let theBinHex=startBinHex; hex_to_int(theBinHex) <= hex_to_int(endBinHex); theBinHex=binHexAddOne(theBinHex)){
        const thePos = hexString.indexOf(`${refIDHex}${theBinHex}`);
        if(thePos != -1){
            const vOff = BintoVirtualOffset(hexString, thePos);
            chunksPos.push(thePos);
            chunks.push(vOff);
            // blockAddressSet.add(vOff.blockAddress);
        }
    }
    return chunks

    // const chunkBegin = BintoVirtualOffset(hexString, startPos);
    // const chunkEnd = BintoVirtualOffset(hexString, endPos);
    // return {'chunkBegin': chunkBegin, 'chunkEnd':chunkEnd, 'chunkSet': blockAddressSet}
}

async function queryBAllCChunks(fileHandle, chunks) {
    let mc_records_with_repeated_items = [];
    await Promise.all(chunks.map(async (chunk, index) => {
        const chunk_mc_records = await queryChunkNew(fileHandle, chunk);
        mc_records_with_repeated_items.push(...chunk_mc_records);
    }));
    return mc_records_with_repeated_items
}

async function queryChunk(fileHandle, blockAddress ,startOffset, endOffset) {
    endOffset += 2*MC_RECORD_SIZE;
    const chunkBuf = Buffer.allocUnsafe(endOffset);
    const {allBytesRead} = await fileHandle.read(chunkBuf, 0, endOffset, blockAddress);
    const unzippedChunk = await unzip(chunkBuf);
    const chunk = unzippedChunk.slice(startOffset, endOffset);
    const leng_mc_cov = 2;
    let mc_records = [];
    for (let positionStartNow = 0; positionStartNow <= chunk.length - MC_RECORD_SIZE;) {
        let mc_record = {}
        mc_record['pos'] = chunk.slice(positionStartNow, positionStartNow + 4).readUInt32LE();
        positionStartNow += 4;
        mc_record['ref_id'] = chunk.slice(positionStartNow, positionStartNow + 2).readUInt16LE();
        positionStartNow += 2;
        mc_record['mc'] = chunk.slice(positionStartNow, positionStartNow + leng_mc_cov).readUInt16LE();
        positionStartNow += leng_mc_cov;
        mc_record['cov'] = chunk.slice(positionStartNow, positionStartNow + leng_mc_cov).readUInt16LE();
        positionStartNow += leng_mc_cov;
        mc_records.push(mc_record);
        // console.log('done');
    }
    return mc_records
}

async function queryChunkNew(fileHandle, chunk) {
    const startBlock = chunk['chunkStart'];
    const endBlock = chunk['chunkEnd'];
    let mc_records = [];
    if(startBlock['blockAddress'] == endBlock['blockAddress']){
        const mc_records_chunk = await queryChunk(fileHandle, startBlock['blockAddress'], startBlock['blockOffset'], endBlock['blockOffset']);
        mc_records.push(...mc_records_chunk);
    } else {
        const chunkStart_mc_records = await queryChunk(fileHandle, startBlock['blockAddress'], startBlock['blockOffset'], 65535);
        mc_records.push(...chunkStart_mc_records);
        const chunkEnd_mc_records = await queryChunk(fileHandle, endBlock['blockAddress'], endBlock['blockOffset'] % MC_RECORD_SIZE, endBlock['blockOffset']);
        mc_records.push(...chunkEnd_mc_records);
    }
    return mc_records
}

function checkRangeRef(header, inputChrRange){
    const ref_id = header['refs'].findIndex(dict => dict['ref_name'] === inputChrRange.chr);
    if (ref_id === -1) {
        throw new Error("The chromosome was not found!");
    }
    const ref = header["refs"].find(item => item.ref_name === inputChrRange.chr);
    if (inputChrRange.end > ref["ref_len"]) {
        throw new Error("The query range is outside of the reference size!");
    }
    return 0
}

async function query(filePath, chrRange) {
    const inputChrRange = new ChrRange(chrRange);
    const fileHandle = new LocalFile(filePath);
    if (inputChrRange.start >= inputChrRange.end) {
        throw new Error("The end should be greater than the start!");
    }

    console.log(`Query BAllC File：${filePath} \nChromosome Range: ${chrRange}`);

    const headerBuff = Buffer.allocUnsafe(20000);
    const { headerBytesRead } = await fileHandle.read(headerBuff, 0, 20000, 0);
    const ungzipedHeader = await unzip(headerBuff);
    const header = viewHeaderBAIIC(ungzipedHeader);
    checkRangeRef(header, inputChrRange);

    const ref_id = header['refs'].findIndex(dict => dict['ref_name'] === inputChrRange.chr);
    const chunkAddress = await queryBGZFIndex(filePath + '.bci', inputChrRange, ref_id);
    const mc_records_with_repeated_items = await queryBAllCChunks(fileHandle, chunkAddress);
    const mc_records = reviseDuplicates(mc_records_with_repeated_items, inputChrRange.start, inputChrRange.end);
    console.log(mc_records);
    return mc_records
}


// const testBallc = new BAllC('/Users/jiaweishen/WebstormProjects/ballc/sample_ballc_files/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc');
// const mc_records = await testBallc.query('chr1:0-1000000')

// module.exports = {BAllC}
export { BAllC };