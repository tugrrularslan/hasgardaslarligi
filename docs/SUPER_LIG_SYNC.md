# Süper Lig fikstür ve sonuç eşitlemesi

Yönetici panelindeki **Süper Lig'i Eşitle** düğmesi, aktif sezonun Süper Lig
fikstürünü tek bir istekte içeri alır ve mevcut kayıtları güvenli biçimde
günceller. Bu işlem zamanlanmış görev veya ücretli veri sağlayıcısı kullanmaz.
Yönetici düğmeye basmadıkça hiçbir dış kaynak çağrısı yapılmaz.

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
bir kez geniş eşleştirme yapar; sonra yalnızca aktif sezon sorgulanır. API
anahtarı veya yeni ortam değişkeni gerekmez.

Yerel veri kuralları için `npm test`, canlı kaynakla salt-okunur uyumluluk
kontrolü için ise `npm run test:super-lig-source` kullanılır.
