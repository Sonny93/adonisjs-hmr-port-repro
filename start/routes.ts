import router from '@adonisjs/core/services/router'

router.get('/', ({ view }) => {
  return view.render('pages/home', { receivedHmrPort: process.env.VITE_HMR_PORT ?? 'unset' })
})
