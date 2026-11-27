router.post('/bookings/:id/reschedule', bookCtrl.requestReschedule);
router.post('/bookings/reschedule/:id/accept', bookCtrl.acceptReschedule);
router.post('/bookings/reschedule/:id/suggest', bookCtrl.suggestReschedule);