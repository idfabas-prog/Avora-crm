# Phase 20 Manual Test Plan

1. Run Phase 20 migration in staging.
2. Run staging-safe Phase 20 seed.
3. Start app in staging mode.
4. Open `/api/health`.
5. Open `/settings/system`.
6. Open `/settings/system/launch-readiness`.
7. Verify environment validation.
8. Verify feature gates are off.
9. Verify demo seed is blocked when SQL session environment is production without override.
10. Test patient isolation.
11. Test manager location isolation.
12. Test compensation isolation.
13. Test clinical isolation.
14. Test recording isolation.
15. Test accounting isolation.
16. Test unauthorized API route.
17. Test unauthorized server action.
18. Test rate limiting.
19. Test bad webhook signature.
20. Test internal job route auth.
21. Test maintenance mode.
22. Test read-only mode.
23. Verify service worker cache safety.
24. Verify signed clinical file access.
25. Test error boundary behavior.
26. Test health endpoint.
27. Test stuck job detection.
28. Test failed job listing.
29. Review access report.
30. Review high-risk permissions.
31. Run CI pipeline.
32. Run full tests.
33. Run build.
34. Run dependency audit.
35. Run staging smoke tests.
36. Review launch blockers.
37. Review rollback runbook.
38. Review backup/restore runbook.
39. Review incident response.
40. Confirm no live integration is enabled.
41. Confirm Phase 1-19 core workflows still function.

