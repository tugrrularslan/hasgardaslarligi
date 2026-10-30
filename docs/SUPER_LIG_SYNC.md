# Süper Lig fikstür ve sonuç eşitlemesi

Yönetici panelindeki **Süper Lig'i Eşitle** düğmesi, aktif sezonun Süper Lig
fikstürünü tek bir istekte içeri alır ve mevcut kayıtları güvenli biçimde
günceller. Aynı uç nokta GitHub Actions tarafından saatte bir otomatik çağrılır. Ücretli veri sağlayıcısı kullanılmaz.

## Kaynak ve doğrulama

- TFF'nin herkese açık fikstür sayfası, resmi hafta numarası ve iç/dış saha
  eşleşmesi için asıl kaynaktır.
- ESPN'in anahtarsız herkese açık Süper Lig akışı, gerçek başlangıç tarihi/saatini
  ve sonuç için ikinci doğrulamayı sağlar.
- Bir sonuç ancak TFF ve ESPN aynı skorla tamamlandı gösterdiğinde puanlanır.
  Çelişkili ya da eksik veri yalnızca yöneticiye bildirilir; skor, tahmin ve
  puanlar değişmez.
- TFF'nin sayfasında 18 takım için 34 hafta ve 306 maç görülmüyorsa veya iki
  kaynakta bütün eşleşmeler bulunmuyorsa işlem tamamen durur. Kısmi fikstür
  yazılmaz.

## Veri güvenliği

- Her içe alınan maçın TFF maç kimliği saklanır. Böylece ikinci eşitlemede yeni
  maç oluşturulmaz.
- Eski, elle oluşturulmuş maçlar aynı sezon + hafta + ev sahibi + deplasman
  eşleşmesiyle bulunur ve mevcut belge kimliği korunur. Tahminler bu kimlikte
  kaldığı için silinmez veya kopmaz.
- Eşitleme hiçbir maçı silmez. Yinelenen eski kayıtlar belirsiz olduğu için
  atlanır ve yöneticiye bildirilir.
- Planlanmış maçlarda hafta, takım adı, tarih, saat ve tahmin son zamanı
  güncellenir. Sonuçlanmış maçların skor düzeltmesi mevcut, sürümlemeli puan
  hesaplama yolundan geçer.
- Haricî kaynak golcü ayrıntısı doğrulanamadığında skor yine işlenebilir; maç
  `goalDetailsStatus: "unavailable"` olarak işaretlenir. Yönetici dilerse
  sonradan mevcut sonuç düzenleme ekranından golcüleri ekleyebilir.

## Bilerek otomatikleştirilmeyenler

Eşitleme `publishedWeeks` kaydını değiştirmez, bildirim yollamaz ve yeni hafta
yayınlamaz. Haftayı yayınlama/geçirme ve haftalık şampiyon bonusunu verme
yönetici panelindeki mevcut açık düğmelerle, manuel olarak yapılır. Sonuç
düzeltmesi daha önce elle verilmiş bir haftalık bonusu mevcut kurala göre
yeniden denetleyebilir; ilk kez bonus vermez.

## Maliyet ve kullanım

Bu kurulum Cloud Functions, Cloud Scheduler, Cloud Tasks ve Vercel Cron
eklemez. Normal bir eşitlemede bir TFF ve iki ESPN okuma isteği, yalnızca
değişen Firestore maç belgeleri ve sonuçlanan mevcut maçların mevcut puan
hesaplama yazmaları oluşur. İlk çalıştırma eski, sezonsuz maçları korumak için
bir kez geniş eşleştirme yapar; sonra yalnızca aktif sezon sorgulanır. Veri sağlayıcı API anahtarı gerekmez. Otomasyon kurulumu aşağıdadır.

Yerel veri kuralları için `npm test`, canlı kaynakla salt-okunur uyumluluk
kontrolü için ise `npm run test:super-lig-source` kullanılır.

## Otomasyonu devreye alma

1. En az 32 karakterli rastgele bir `SUPER_LIG_SYNC_SECRET` oluşturun. Bunu
   Vercel Production ortam değişkenlerine ekleyin; tarayıcıya açık `NEXT_PUBLIC_`
   öneki kullanmayın. Mevcut Firebase Admin değişkenleri korunur.
2. Aynı değeri GitHub → Settings → Secrets and variables → Actions → Secrets
   altında `SUPER_LIG_SYNC_SECRET` adıyla kaydedin.
3. Actions → Variables altında `SUPER_LIG_SITE_URL` değerini gerçek HTTPS üretim
   adresi olarak girin (ör. https://uygulamaniz.vercel.app).
4. Değişiklikleri üretime dağıtın. Workflow dosyası varsayılan dala girdikten
   sonra Actions → Süper Lig sonuçlarını eşitle → Run workflow ile deneyin.
   HTTP başarı yanıtında `scoringErrors` boş olmalı. Kaynak uyuşmazlıklarını
   ve atlanan belirsiz maç sayılarını da kontrol edin.
5. Yönetici panelinde istenen haftayı **Haftayı Yayınla** ile aktif seçin.
   Zaten yayınlanmış bir hafta yeniden seçilebilir; bildirim tekrar gönderilmez.

Görev her saatin 17. dakikasında çalışır; GitHub zamanlaması gecikebilir.
Ücretsiz standart Linux çalıştırıcısı kullanılır; açık depolarda Actions
ücretsizdir. Özel depolarda hesabın ücretsiz dakika kotası geçerlidir:
Actions harcama bütçesini sıfır tutun. Firebase/Vercel ücretsiz kotaları da
geçerlidir; sınırsız hizmet varsayılmaz. Başarısız görev sonraki saatte tekrar
çalışır. Yarım kalan aynı skorun puanlaması mevcut sürümleme sistemiyle
sürdürülür; puan iki kez verilmez. Yönetici düğmesi kullanılmaya devam eder.

## Aktif hafta

`settings/currentSeason.activeWeek` ve `activeWeekSeasonId` yalnızca yönetici
haftayı yayınladığında/seçtiğinde yazılır. Otomasyon bu belgeye yazmaz.
Tahmin ekranı açıldığında bu ayarı okur; haftalar arasında gezinme yalnızca
sayfanın belleğinde tutulur. Maçların bitmesi, tahmin kaydetme ve fikstür
indirme aktif haftayı değiştirmez. Başka sezonun haftası kullanılmaz. İlk
kurulumda yönetici hafta seçene kadar açıklama ve hafta gezinme düğmeleri
sunulur; tahmin tarihinden hafta türetilmez.

Yayın öncesi: `npm test`, `npx tsc --noEmit`, `npm run build` çalıştırın.
Canlı kaynak kontrolü `npm run test:super-lig-source` salt okunurdur. Gerçek
Firebase yazma/puanlama doğrulaması, üretime geçmeden önce ayrı bir test
Firebase projesinde yönetici hesabıyla yapılmalıdır.
