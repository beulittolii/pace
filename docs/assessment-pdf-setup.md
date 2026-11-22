# 수행평가 PDF 첨부 운영

PACE 학생 로그인과 수행평가 정보는 Firebase에 그대로 둔다. Supabase의 `assessment-pdfs` 비공개 버킷은 원본 PDF만 보관한다. 기존 사이트 계정이나 결제 플랜 변경은 필요 없다. PDF는 수행평가당 1개, 파일당 최대 5 MiB(5,242,880바이트)다.

## 배포

Supabase CLI에서 대상 프로젝트에 배포 권한이 있는 계정으로 로그인한다. 아래 예는 PACE 운영 프로젝트다. 다른 프로젝트를 쓸 경우 `assessment-pdf-config.js`의 공개 함수 주소도 맞춘다.

```sh
npx supabase db push --dry-run --remote=iduefrwbaqpdmiqxxnuy
npx supabase db push --remote=iduefrwbaqpdmiqxxnuy --yes
npx supabase secrets set --remote=iduefrwbaqpdmiqxxnuy --yes 'PACE_PDF_ORIGINS=https://beulittolii.github.io,http://localhost:8000,http://127.0.0.1:8000'
npx supabase functions deploy assessment-pdf --remote=iduefrwbaqpdmiqxxnuy --use-api --no-verify-jwt --yes
```

함수의 기본 Supabase JWT 검증은 끄지만, 함수 자체가 PACE Firebase 토큰을 검증하고 Firestore에서 학생과 수행평가 소유권을 확인한다. 공개 버킷 또는 직접 다운로드 정책을 추가하지 않는다. 브라우저에 서비스 역할 키나 학생 토큰을 설정값으로 넣지 않는다. 도메인을 옮기면 `PACE_PDF_ORIGINS`에 경로 없이 정확한 origin을 설정한다.

Supabase 무료 프로젝트가 일시 정지되면 대시보드에서 **Resume project**를 선택한다. 사용량은 조직의 Usage에서 확인한다. 중요한 자료는 학생이 원본도 별도로 보관하도록 안내한다.

## 삭제된 수행평가의 원본 정리

학생이 첨부 영역에서 PDF를 삭제하면 원본도 제거된다. 평가 자체가 먼저 삭제되거나 학생 연결이 바뀌면 원본을 다시 열 수 없다. 관리자가 정리할 때는 Supabase Storage 대시보드에서 `UID/학생 ID/수행평가 ID.pdf`를 Firestore `academicRecords/academicAssessments_<학생 ID>`의 현재 목록 및 계정 연결과 대조하고, 더 이상 연결된 평가가 없는 원본만 삭제한다. 파일 경로나 내용을 공개하지 않는다.
