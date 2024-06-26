# BAllC
BAllC is a javascript API for reading and querying the BAllC files. The original C++ BAllC project is available [here](https://github.com/jksr/ballcools).

# Installation
Requires [Node](https://nodejs.org/)

    $ npm install ballc

# Examples
```javascript
import { BAllC } from "ballc";

//@para: filePath (object): {path: /path/to/ballc, url: https://path/to/ballc, ...}, path or url is required. 
//@para: chrRange (str): chr{chrName}:{start}-{end}

async function testBAllC(filePath, chrRange) {
    const testBallc = new BAllC(filePath);

    const mc_records = await testBallc.query(chrRange);
    const header = await testBallc.getHeader();
    
    return mc_records;
    // return header;
}

// local test
// const results = await queryBAllC(
//     { path: "/path/to/ballc" },
//     "chr1:0-1000000"
// );

//remote test
const results = await queryBAllC(
    { url: "https://wangftp.wustl.edu/~dli/ballc/ballc/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc" },
    "chr1:0-1000000"
);
```

### Main functions

#### query

```javascript
    //In Class function, chrRange example: "chr1:0-100000"
    async query(chrRange)

    //Usage, the mc_records is an array of objects [Object, ...], the range format: "chr{chrName}:{start}-{end}"
    const mc_records = await testBallc.query(range);
```

Here's the [doc](https://github.com/jksr/ballcools/blob/main/doc/ballc_spec.pdf) for the mc_records.
![img.png](imgs/mc_records_format.png)

#### getHeader

```javascript
    //In Class function
    async getHeader()

    //Usage, the header is an array of objects [Object, ...]
    const header = await testBallc.getHeader();
```
Here's the [doc](https://github.com/jksr/ballcools/blob/main/doc/ballc_spec.pdf) for the header.
![header_format.png](imgs/header_format.png)

### Some utility functions

Here are some functions that you may find them helpful, but they are not in the BAllC class.

#### VirtualOffset
```javascript
//This Class initiate the vitual offset of the bgzf file format. 
class VirtualOffset(blockAddress, blockOffset)
```
For the virtual offset of bgzf file, you can find details [here](https://biopython.org/docs/1.75/api/Bio.bgzf.html)

#### ChrRange
```javascript
//This Class initiate the query range. chrRange: "chr{chrName}:{start}-{end}"
class ChrRange(chrRange)
```

#### reg_to_bin
```javascript
//An utility function in bgzf
function reg_to_bin(beg, end)
```
You can find reg_to_bin function [here](https://samtools.github.io/hts-specs/tabix.pdf)

#### queryBGZFIndex and queryBAIIC
```javascript
//This is the function that reads the bgzf index.
async function queryBGZFIndex(filePath, chrRange, ref_id)
//This is the core function that search the target query range in the index file(.bci)
function queryBAIIC(chrRange, hexString, refID)
```

#### queryChunk
```javascript
//This is the core function that queries the chunks after we convert the virtual offsets to the offsets in the .ballc file.
async function queryChunk(fileHandle, blockAddress ,startOffset, endOffset)
```

### Sample BAllC file
We also provided some BAllC sample files (obtained from Wei Tian) for test. You can download the some files from [here](https://wangftp.wustl.edu/~dli/ballc/ballc/).


