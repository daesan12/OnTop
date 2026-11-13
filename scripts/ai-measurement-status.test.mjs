import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyUnhidden,transportValidity } from './ai-measurement-status.mjs'

test('each unhidden ACK has exactly one cause even before it is persisted', () => {
  const chats=['ingress','pending','normal','delivery'].map(messageId => ({messageId}))
  const rows=new Map([
    ['pending',{processed:false,hidden:false}],
    ['normal',{processed:true,hidden:false}],
    ['delivery',{processed:true,hidden:true}],
  ])
  const counts=classifyUnhidden(chats,rows)
  assert.deepEqual(counts,{awaitingIngestion:1,awaitingReview:1,reviewedNotHidden:1,hiddenWithoutNotification:1})
  assert.equal(Object.values(counts).reduce((sum,n) => sum+n,0),chats.length)
})

test('completed hides do not imply missing classifications in an empty result', () => {
  assert.deepEqual(classifyUnhidden([],new Map()),
    {awaitingIngestion:0,awaitingReview:0,reviewedNotHidden:0,hiddenWithoutNotification:0})
})

test('zero-input timeouts are invalid even when no false hides are observed', () => {
  const valid={errors:[],timeouts:0,closedRequests:0,disconnects:[]}
  assert.deepEqual(transportValidity([valid,valid,valid],66),{valid:true,issues:[]})
  const failed=transportValidity([{...valid,timeouts:439,disconnects:[{code:1006}]}],0)
  assert.equal(failed.valid,false)
  assert.deepEqual(failed.issues,['CHAT_EXPOSURE_NOT_66','REQUEST_TIMEOUT','SOCKET_CLOSED'])
})
