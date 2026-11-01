# Site erişim izleme

Bu izleme, uygulama verilerinden tamamen ayrıdır. Her çalıştırmada ana sayfaya HTTPS üzerinden `GET` isteği gönderir; yalnızca `200`–`399` arası HTTP yanıtları erişilebilir kabul edilir. Ağ hatası, zaman aşımı veya diğer HTTP yanıtları kesinti sayılır.

`.github/workflows/uptime-monitor.yml` işi UTC ile saat başındaki yoğunluktan kaçınacak biçimde beş dakikada bir çalışır. Her kontrol en fazla 20 saniye, işin tamamı en fazla iki dakika sürer.

## Kesinti kaydı ve bildirim

İlk başarısız kontrolde GitHub Issues içinde `[Uptime] Has Gardaşlar Ligi erişim kesintisi` başlıklı tek bir kayıt açılır. Kayıt şunları korur:

- kesintinin başlangıç saati (UTC) ve ilk hatanın sonucu;
- erişim geri geldiğinde bitiş saati (UTC), HTTP durumu ve tahmini süre;
- kapatılmış GitHub Issue olarak geçmişteki kesinti kaydı.

Kesinti sürerken yeni Issue veya tekrar eden bildirim üretilmez. Site geri geldiğinde aynı kayda yorum yapılır ve kayıt kapatılır.

Bildirim almak isteyen GitHub kullanıcısı depoda **Watch → Custom → Issues** seçeneğini etkinleştirmelidir. Böylece kesinti Issue'su açıldığında ve aynı Issue'ya geri dönüş yorumu eklendiğinde GitHub'ın kendi e-posta/push bildirim tercihleri uygulanır. Bu seçenek ek bir hizmet, anahtar veya ücret gerektirmez.

GitHub hesabı olmayan ziyaretçilere toplu site içi/push uyarısı bu sistemin kapsamı dışındadır: bunun için Firebase bildirim alıcılarını okuyup yazmak gerekir. Mevcut FCM, Firestore, tahmin, maç ve kullanıcı verileri bu izleme tarafından hiç okunmaz veya değiştirilmez.

## Ücretsiz kullanım ve sınırlar

Bu depo herkese açıktır. GitHub'ın standart barındırılan çalıştırıcıları, herkese açık depolarda ücretsizdir. İş akışı artefakt veya önbellek oluşturmaz; ayrıca ücretli bir servis ya da gizli anahtar kullanmaz.

GitHub Actions zamanlanmış işlerin en kısa aralığını beş dakika ile sınırlar. Yoğun zamanlarda bu planlama gecikebilir; bu nedenle bu araç beş dakikalık **hedef aralıklı** izleyicidir, kesintinin kesin başlangıç anını garanti etmez. Herkese açık depolardaki zamanlanmış işler 60 gün etkinlik olmazsa otomatik devre dışı kalabilir. Böyle bir durumda Actions sayfasından işi yeniden etkinleştirin veya depoda bir etkinlik oluşturun.

## İlk yayından sonra kontrol

1. GitHub Actions içindeki **Site erişim izleme** işini açıp **Run workflow** ile elle başlatın. Günlükte `Site erişilebilir (HTTP ...)` görünmelidir.
2. Depo ayarlarında Actions için iş akışlarının etkin ve `GITHUB_TOKEN` izinlerinin yazma yetkili olduğunu doğrulayın. Bu iş akışı yalnızca kendi Issue'larını açıp güncellemek için `issues: write` ister.
3. Bildirim istenen GitHub hesabında **Watch → Custom → Issues** seçeneğini açın.
