router.post('/bookings/:id/reschedule', bookCtrl.requestReschedule);
router.post('/bookings/reschedule/:id/accept', bookCtrl.acceptReschedule);
router.post('/bookings/reschedule/:id/suggest', bookCtrl.suggestReschedule);

router.get('/schedule',                    schedCtrl.getWeek);
router.post('/schedule/slots',             schedCtrl.createSlot);
router.delete('/schedule/slots/:id',       schedCtrl.deleteSlot);
router.post('/schedule-requests/:id/publish', schedCtrl.publishRequest);
router.post('/schedule-requests/:id/decline', schedCtrl.declineRequest);
router.post('/schedule-requests/:id/reschedule', schedCtrl.rescheduleRequest);
router.post('/schedule/template',          schedCtrl.saveTemplate);
router.post('/schedule/apply-template',    schedCtrl.applyTemplate);