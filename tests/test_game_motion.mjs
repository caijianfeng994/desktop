import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advancePose, angleDelta} from '../src/desktop_robot/studio/static/game/motion.mjs';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);
test('turning in place never translates sideways',()=>{
 let pose={x:0,z:0,yaw:0};
 const target={x:1,z:0};
 pose=advancePose(pose,target,1/60);
 close(pose.x,0);close(pose.z,0);
 assert.ok(pose.yaw>0&&pose.yaw<Math.PI/2);
 for(let i=0;i<90;i++){
  const next=advancePose(pose,target,1/60);
  if(Math.hypot(next.x-pose.x,next.z-pose.z)>1e-6) close(angleDelta(next.yaw,Math.PI/2),0);
  pose=next;
 }
 assert.equal(pose.arrived,true);close(pose.x,1);close(pose.z,0);
});
test('all four directions and a U-turn arrive facing the direction of travel',()=>{
 let pose={x:0,z:0,yaw:0};
 for(const target of [{x:1,z:0},{x:1,z:1},{x:1,z:0},{x:0,z:0},{x:0,z:1}]){
  const desired=Math.atan2(target.x-pose.x,target.z-pose.z);
  for(let i=0;i<120;i++)pose=advancePose(pose,target,1/60);
  assert.equal(pose.arrived,true);close(pose.x,target.x);close(pose.z,target.z);close(angleDelta(pose.yaw,desired),0);
 }
});
test('wraparound takes shortest turn and does not overshoot',()=>{
 const pose={x:0,z:0,yaw:Math.PI-.01};
 const target={x:-.01,z:-1};
 const next=advancePose(pose,target,.001);
 assert.ok(next.yaw>pose.yaw);
 const done=advancePose(next,target,10);
 close(done.x,target.x);close(done.z,target.z);assert.equal(done.arrived,true);
});
test('pause and idle preserve position and heading',()=>{
 const pose={x:0,z:0,yaw:.7};
 const stopped=advancePose(pose,{x:1,z:0},0);
 close(stopped.x,0);close(stopped.z,0);close(stopped.yaw,.7);
 const idle=advancePose(pose,{x:0,z:0},.5);
 close(idle.yaw,.7);assert.equal(idle.arrived,true);
});
