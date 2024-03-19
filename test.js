// const BAllC = require('@jiawei_s/ballc');
import {BAllC} from '@jiawei_s/ballc';

// const BAllC = require('./src/BAllC.js');
const testBallc = new BAllC("/Users/jiaweishen/WebstormProjects/readBAIIC/sample_ballc_files/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc");
// testBallc.query('chr1:0-1000000')

const mc_records = testBallc.query('chr1:0-1000000')
console.log('Done')