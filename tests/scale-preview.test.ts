import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scalePreview} from '../apps/api/src/domain/scale-preview.js';
const room=(id:string,area:number|null,side=100)=>({id,name:id,active:true,area_m2:area,shape:{polygon:[[0,0],[side,0],[side,side],[0,side]]}});
test('consistent known rooms estimate unknown areas without mutating official values',()=>{const rooms=[room('a',25),room('b',25),room('c',25),room('unknown',null,200)];const p=scalePreview(rooms);assert.equal(p.consistent,true);assert.equal(p.candidate,.05);assert.equal(p.recoverable,1);assert.equal(p.rooms[3].calculated,100);assert.equal(rooms[3].area_m2,null);});
test('too few samples, mixed scales, invalid contours and inactive rooms cannot justify application',()=>{assert.equal(scalePreview([room('a',25)]).consistent,false);assert.equal(scalePreview([room('a',25),room('b',25),room('c',100)]).consistent,false);const p=scalePreview([{...room('bad',25),shape:{polygon:[[0,0],[1,1],[1,0],[0,1]]}},{...room('old',25),active:false},room('blank',null)]);assert.equal(p.sampleCount,0);assert.equal(p.candidate,null);assert.equal(p.withoutContour,1);});
