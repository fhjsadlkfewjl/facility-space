import {test} from 'node:test';
import assert from 'node:assert/strict';
import {furnitureVisual} from '../apps/web/src/furniture-visual.js';
test('original SVG without a basis retains recorded size and origin instead of a placeholder',()=>{
 const v=furnitureVisual({width:null,depth:null,template_svg:'<svg/>',template_geometry:{geometry:{root:{width:80,height:35},basis:[]},box:{cx:40,cy:18}}});
 assert.deepEqual(v,{original:true,width:80,height:35,x:-40,y:-18,placeholder:false});
});
test('resized basis scales complete artwork without confusing artwork extent and furniture footprint',()=>{
 const v=furnitureVisual({width:120,depth:60,template_svg:'<svg/>',template_geometry:{geometry:{root:{width:80,height:50},basis:[{width:60,height:30}]},box:{cx:40,cy:25}}});
 assert.equal(v.width,160);assert.equal(v.height,100);assert.equal(v.x,-80);assert.equal(v.placeholder,false);
});
test('missing artwork and incomplete dimensions still use a clearly marked fallback',()=>{
 assert.equal(furnitureVisual({width:100,depth:null}).placeholder,true);
 assert.equal(furnitureVisual({width:100,depth:50}).placeholder,false);
 assert.equal(furnitureVisual({template_svg:'<svg/>',template_geometry:{geometry:{root:{width:0,height:30}}}}).original,false);
});
