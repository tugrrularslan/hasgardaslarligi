# Ücretsiz katmana güvenli geçiş

Bu uygulama ücretli Google Cloud çalışma yükü oluşturmadan çalışacak şekilde düzenlendi. Amaç, Firebase'in Spark planı ve Vercel Hobby planı sınırlarında kalmaktır. Bu bir **harcama yapılmayacak mimari tercihi**dir; sağlayıcıların ücretsiz kotaları, koşulları ve ürünleri gelecekte değişebileceği için "ömür boyu sıfır maliyet" garantisi değildir.

## Kodda yapılanlar

| Hizmet | Durum |
| --- | --- |
| Firebase Cloud Functions | Uygulama zaten kullanmıyordu; ek iş yapılmadı. |
| Cloud Scheduler | Kaynak kodda yapılandırması yok. Konsolda eski bir iş varsa kapatılmalı. |
| Cloud Tasks | Maç oluşturma/güncellemeden çıkarıldı; görev oluşturma, silme ve görev alıcısı kodu kaldırıldı. |
| Vercel Cron | Günlük oyuncu senkronizasyonu cron'u ve `vercel.json` kaldırıldı. Oyuncu senkronizasyonu yönetici panelinden elle başlatılır. |
| GitHub Actions zamanlayıcısı | Eski bildirim uç noktasını beş dakikada bir çağıran iş akışı kaldırıldı. |
| Cloud Firestore | Korundu. Maçlar, tahminler, kullanıcılar ve puanlar silinmez. |
| Cloud Storage | Kodda dosya yükleme/indirme yoktu. Storage yapılandırması ve uzak görsel izni çıkarıldı; uygulama görselleri `public/` içinden Vercel'de sunulur. |
| FCM | Yönetici eylemiyle gönderilen bildirimler korunur. FCM güncel olarak no-cost Firebase ürünüdür. |

Zamanı kesin olan iki maç hatırlatıcısı (maçtan 1 saat önce ve tahmin kapanışından 10 dakika önce) artık sunucu tarafında planlanmaz. Bunun yerine uygulama açıkken çalışan tarayıcı yerel bildirimi vardır. Bu yol ücret doğurmaz, fakat kullanıcı uygulamayı/bir sekmeyi açık tutmazsa bildirim teslim garantisi vermez. Yönetici tarafından gönderilen bildirimler, haftanın tableti yayını ve Kahin transfer istisnası gibi bir kullanıcının yönetici eylemiyle tetiklenen FCM bildirimleri devam eder.

## Geçiş sırası

1. **Önce yedek al.** Bu repo, tüm kök koleksiyonları ve alt koleksiyonları tek JSON dosyasına alan yerel bir yedek aracı içerir. Firebase Admin ortam değişkenlerinin bulunduğu güvenilir bir bilgisayarda çalıştır:

   ```powershell
   npm run backup:firestore -- --output backups/gecis-oncesi.json
   npm run restore:firestore -- --file backups/gecis-oncesi.json --dry-run
   ```

   `backups/` git tarafından yok sayılır; bu dosya kullanıcı, tahmin ve bildirim anahtarı verisi içerebileceğinden paylaşılmamalıdır. Gerçek geri yükleme, yanlışlıkla çalışmayı önlemek için ayrıca `--confirm-restore` ister. Geri yükleme yalnızca aynı Firebase proje kimliğine izin verir ve yedekte olmayan belgeleri silmez.

2. **Bu değişikliği Vercel'e dağıt.** Dağıtımdan sonra yeni maç oluşturma ve maç saatini değiştirme işlemlerinin başarılı olduğunu yönetici panelinden kontrol et. Bu adım mevcut Firestore verisini değiştirmez.

3. **Eski Cloud Tasks kuyruğunu temizle.** Google Cloud Console'da doğru proje seçiliyken Cloud Tasks > `match-reminders` kuyruğunu duraklatıp bekleyen görevleri sil veya kuyruk artık başka hiçbir şey için kullanılmıyorsa kuyruğu sil. Bu işlem yalnızca geçmişte oluşturulmuş bildirim görevlerini kaldırır; Firestore, Authentication, kullanıcılar ve tahminler etkilenmez. Koddaki yeni sürüm artık bu kuyruğa görev eklemez.

4. **Eski zamanlayıcıları kontrol et.** Cloud Scheduler'da bu projeye ait eski bir iş bulunuyorsa devre dışı bırak veya sil. Vercel projesinde eski dağıtım cron'u görünüyorsa, yeni dağıtımın ardından Vercel > Settings > Cron Jobs ekranından kaldırıldığını doğrula. GitHub Actions > Actions ekranında daha önce başlamış `Match Reminder Cron` çalıştırmaları varsa iptal et; bu değişiklik yayımlandıktan sonra yeni zamanlanmış çalıştırma oluşmaz.

5. **Ücretsiz plana geçişi doğrula.** Ücretsiz deneme bitince ücretli Cloud Billing hesabına yükseltme yapma. Firebase'in resmi açıklamasına göre ücretli hesaba yükseltilmemiş deneme hesabına bağlı proje Spark planına iner. Firebase/Google Cloud Billing ekranında projenin ücretli bir faturalandırma hesabına bağlı olmadığını kontrol et.

## Dağıtımdan sonraki kısa kontrol

- Giriş, tahmin yazma, puan tablosu ve yönetici paneli çalışıyor mu?
- Yeni bir maç oluşturma ve güncelleme, Cloud Tasks hatası olmadan başarılı mı?
- Bildirim izni veren açık bir tarayıcı sekmesinde, yaklaşan maç için yerel hatırlatıcı görünüyor mu?
- Yönetici panelinden test amaçlı tek bir FCM bildirimi gönderilebiliyor mu?
- Firebase Console'da Firestore verileri, Authentication kullanıcıları ve güvenlik kuralları yerinde mi?
- Vercel Usage ve Firebase Usage & billing panellerinde ücretli hizmet etkinliği görünmüyor mu?

## Sınırlar ve izleme

Spark planı Firestore için no-cost kota sunar; güncel belgelerde 50.000 okuma/gün, 20.000 yazma/gün, 20.000 silme/gün, 1 GiB depolama ve 10 GiB/ay ağ çıkışı belirtilir. Kota aşılırsa Spark planı ücret yazmak yerine ilgili hizmeti dönem sonuna kadar kapatabilir. Bu nedenle hobi uygulamasında çok sayıda sürekli gerçek-zamanlı dinleyici veya büyük veri sorgusu eklemeyin.

Firebase Cloud Storage, Spark planında artık kullanılamaz; uygulamanın kullanıcı dosyası yüklememesi bu yüzden bilinçli bir tercihtir. Büyük dosya, video veya kullanıcı yüklemesi eklenmeden önce mimariyi yeniden değerlendirin.

Vercel Hobby ücretsizdir ve kişisel/hobi kullanımı içindir. Güncel belgelerine göre kota aşımı çoğunlukla ücretlendirme yerine özelliğin sonraki döneme kadar beklemesine yol açar; buna rağmen kontrol panelini düzenli incelemek iyi bir alışkanlıktır. Otomatik cron kaldırıldığı için Vercel'in zamanlama sınırlarına bağımlılık kalmaz.

## Resmî kaynaklar

- [Firebase fiyatlandırma planları](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firebase fiyatlandırması ve Firestore ücretsiz kotası](https://firebase.google.com/pricing)
- [Firebase Cloud Storage'ın Spark planı gereksinimi](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- [Firebase SSS: deneme bitince Spark planına dönüş](https://firebase.google.com/support/faq)
- [Vercel Hobby planı](https://vercel.com/docs/plans/hobby)
- [Vercel cron kullanım ve fiyatlandırması](https://vercel.com/docs/cron-jobs/usage-and-pricing)
