/** Indonesian, English and comment-slang stopwords for the themes skill. Lower-case, no punctuation. */
export const STOPWORDS: string[] = `
yang dan di ke dari untuk dengan pada ini itu ada tidak tak nggak ngga gak ga enggak bukan juga saja aja sudah udah udh belum
akan bisa harus mau ingin pengen pingin lagi lg masih sedang lagi telah sama sm sama2 seperti kayak kaya kek kayaknya kyk gitu
begitu gini begini apa apa2 siapa kapan dimana mana gimana bagaimana kenapa knp mengapa karena krn karna sebab jadi jd maka
kalau kalo klo kl kalau2 jika bila supaya agar biar walau walaupun meski meskipun tapi tp tetapi namun atau ato dll dsb
saya aku gua gue gw gwe kita kami kamu kau lu lo loe elo elu anda dia ia dy mereka nya ny mu ku kalian org orang2 orang
bang mas mbak kak kk ka bro sis dek pak bu bapak ibu min mimin gan sist gaes gais guys teman temen temen2 sob
banget bgt bngt sekali amat sangat paling lebih kurang cukup terlalu agak sih sh dong donk deh dh kok koq lah lho loh
toh yah ya iya iyaa yaa yak yes ye ok oke okay okey sip nah nih ni tuh tu kan kn pun mah yg dgn utk tdk sdh blm dr sy km
gk udh dah jg jgn jangan trs terus tetep tetap emang emg memang bener benar beneran sebenarnya sebenernya sbnrnya
semua smua semuanya seluruh setiap tiap masing2 beberapa sebagian banyak byk bnyk sedikit dikit lebih kurang
hari ini sekarang skrg skrng skr nanti ntar kemarin kmrn besok tadi baru br dulu dl dlu pernah selalu sering jarang kadang
lalu kemudian setelah sebelum sebelumnya selama sampai sampe smp hingga saat ketika waktu wkt sejak
adalah ialah merupakan yaitu yakni tentang ttg soal mengenai terhadap thd bagi oleh olh dalam dlm luar atas bawah antara
bisa bs dapat dpt boleh blh perlu butuh wajib mesti kudu
sudah2 aja2 gitu2 gini2 apa2 yg2 lagi2
lihat liat lht nonton ntn baca bc denger dengar tau tahu tw tau2 ngerti paham
bilang blg ngomong ngmg omong ngomongin cerita crita nyebut sebut kata kata2 katanya
buat bikin utk untuk2 pake pakai pk make
he hehe hehehe haha hahaha hahahaha wkwk wkwkwk wkwkwkwk lol lmao xd hmm hm hmmm eh ehh oh ohh ah ahh wah wahh wow wkwkw
the a an and or but if then so of to in on at for from by with about as is are was were be been being am
i me my mine you your yours he him his she her hers it its we us our they them their this that these those there here
what which who whom whose when where why how not no yes do does did done have has had having will would can could should
shall may might must just very too also only even still yet again more most less least all any some such than
im ive youre hes shes its were theyre dont doesnt didnt cant couldnt wont wouldnt isnt arent wasnt werent thats
ini2 itu2 dia2 kamu2 nya2 org2 bgt2
`.split(/\s+/).filter(Boolean);
