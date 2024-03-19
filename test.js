// const BAllC = require('@jiawei_s/ballc');
import {BAllC} from '@jiawei_s/ballc';

async function queryBAllC(filePath, range){
    // const BAllC = require('./src/BAllC.js');
    const testBallc = new BAllC(filePath);
    // testBallc.query('chr1:0-1000000')

    const mc_records = await testBallc.query(range);
    return mc_records
}

queryBAllC("/Users/jiaweishen/WebstormProjects/readBAIIC/sample_ballc_files/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc", 'chr1:0-1000000')