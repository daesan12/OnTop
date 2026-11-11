// Classify expected hides with no socket notification, including ACKs still in ingress.
export function classifyUnhidden(chats, rows) {
  const counts={awaitingIngestion:0,awaitingReview:0,reviewedNotHidden:0,hiddenWithoutNotification:0}
  for(const chat of chats) {
    const row=rows.get(chat.messageId)
    if(!row) counts.awaitingIngestion++
    else if(!row.processed) counts.awaitingReview++
    else if(!row.hidden) counts.reviewedNotHidden++
    else counts.hiddenWithoutNotification++
  }
  return counts
}

// This judges transport/exposure only, never whether the model produced the desired answers.
export function transportValidity(samples,chatCount) {
  const issues=[]
  if(chatCount!==66) issues.push('CHAT_EXPOSURE_NOT_66')
  if(samples.some(s => s.timeouts>0)) issues.push('REQUEST_TIMEOUT')
  if(samples.some(s => s.errors.length>0)) issues.push('REQUEST_ERROR')
  if(samples.some(s => s.closedRequests>0 || s.disconnects.length>0)) issues.push('SOCKET_CLOSED')
  return {valid:issues.length===0,issues}
}
