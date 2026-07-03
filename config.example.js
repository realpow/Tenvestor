// 사용 방법:
// 1. 이 파일을 복사해서 config.js 로 이름 변경
// 2. 아래 API 키를 실제 발급받은 키로 교체
// 3. config.js 는 .gitignore 에 포함되어 GitHub에 올라가지 않음
window.TENVESTOR_CONFIG = {
  // 한국수출입은행 Open API 인증키
  // 발급: https://www.koreaexim.go.kr > 개발자센터 > API 신청
  EXIM_API_KEY: 'YOUR_EXIM_API_KEY_HERE',

  // DART API 인증키 (기업개요 조회용)
  // 발급: https://opendart.fss.or.kr > 인증키 신청
  DART_API_KEY: 'YOUR_DART_API_KEY_HERE',
};
