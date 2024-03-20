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

