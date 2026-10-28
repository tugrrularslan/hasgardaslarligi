# Has Gardaşlar Ligi

Has Gardaşlar Ligi, Next.js, Firebase Authentication/Cloud Firestore ve Vercel üzerinde çalışan bir hobi tahmin uygulamasıdır.

## Çalıştırma

```bash
npm ci
npm run dev
```

Kontrol ve üretim derlemesi:

```bash
npm test
npm run build
```

## Ücretsiz katman yaklaşımı

Uygulama Cloud Tasks, Cloud Scheduler, Cloud Functions ve Vercel Cron kullanmaz. Firebase Cloud Messaging (FCM), yönetici eylemiyle yapılan bildirimler için korunur; maçın saatine bağlı hatırlatıcılar yalnızca kullanıcı uygulamayı açık tutarken tarayıcıda yerel olarak gösterilir.

Geçiş adımları, Firestore yedek/geri yükleme araçları, kotalar ve manuel temizlenmesi gereken eski bulut görevleri için [ücretsiz katmana güvenli geçiş kılavuzuna](docs/FREE_TIER_TRANSITION.md) bakın.

Süper Lig fikstürü, saat değişiklikleri ve doğrulanmış sonuçların yönetici
tarafından eşitlenmesi için [Süper Lig eşitleme kılavuzuna](docs/SUPER_LIG_SYNC.md)
bakın.
