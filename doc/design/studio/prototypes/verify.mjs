import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

let base=process.env.GG_PROTOTYPE_URL||'http://127.0.0.1:7452';
let output='.taste-skill/studio/compositions';
let browser=await chromium.launch({executablePath:process.env.GG_TEST_BROWSER||'/etc/profiles/per-user/juliuskoskela/bin/google-chrome',headless:true});
let results=[];
await mkdir(output,{recursive:true});
async function check(name,viewport,run){
    let context=await browser.newContext({viewport,reducedMotion:'reduce'});
    let page=await context.newPage();
    page.setDefaultTimeout(5000);
    let errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.tracing.start({screenshots:true,snapshots:true});
    try{
        await run(page);
        assert.deepEqual(errors,[],`${name}: browser exceptions`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: document overflow`);
        results.push({name,passed:true,errors});
    }catch(error){
        results.push({name,passed:false,error:error.message,errors});
        await page.screenshot({path:`${output}/${name}-failure.png`});
        throw error;
    }finally{
        await context.tracing.stop({path:`${output}/${name}.zip`});
        await context.close();
        await writeFile(`${output}/verification.json`,JSON.stringify(results,null,2));
    }
}
async function open(page,concept){await page.goto(`${base}/doc/design/studio/prototypes/index.html?concept=${concept}`)}
async function commands(page,name){await page.locator('#commands').click();await page.getByRole('button',{name,exact:true}).last().click()}
try{
    for(let concept of ['A','B','C'])for(let width of [390,768,1440]){
        await check(`${concept}-${width}`,{width,height:844},async page=>{
            await open(page,concept);
            await page.locator('.row').nth(2).click();
            let source=await page.evaluate(()=>window.REVISIONS[2].id);
            await page.locator('#handle').click();
            assert.equal(await page.locator('#sheet').evaluate(element=>element.getBoundingClientRect().height),76);
            await page.locator('#handle').click();
            await page.locator('#graph').evaluate(element=>element.scrollTop=120);
            let scroll=await page.locator('#graph').evaluate(element=>element.scrollTop);
            await page.screenshot({path:`${output}/${concept}-${width}-half.png`});
            await page.locator('#sheet [data-file]').first().click();
            assert.equal(new URL(page.url()).hash.startsWith(`#revision/${source}/file/`),true);
            await page.screenshot({path:`${output}/${concept}-${width}-file.png`});
            await page.locator('#destination [data-back]').click();
            await page.waitForURL(url=>!url.hash);
            assert.equal(await page.locator('#graph').evaluate(element=>element.scrollTop),scroll);
            assert.equal(await page.locator('.row.selected .id').textContent(),source);
            await commands(page,'Move revision');
            let surface=page.locator(concept==='A'?'#modal':concept==='B'&&width>=880?'#host':'#destination');
            assert.equal(await surface.locator(`[data-target="${source}"]`).count(),0,'source cannot be its own destination');
            let target=await surface.locator('[data-target]').first().getAttribute('data-target');
            await surface.locator('[data-target]').first().click();
            await surface.locator('[data-preview]').click();
            assert.equal(await surface.getByRole('status').last().textContent(),`Preview ready for ${source} → ${target}. No repository changes made.`);
            await page.screenshot({path:`${output}/${concept}-${width}-move.png`});
        });
    }
    await check('B-pinned-tasks',{width:1440,height:844},async page=>{
        await open(page,'B');
        let [from,other]=await page.evaluate(()=>window.REVISIONS.slice(0,2));
        await page.locator('.row').nth(0).click();
        await page.locator('#sheet [data-tool="Move revision"]').click();
        await page.locator(`#host [data-target="${other.id}"]`).click();
        await page.locator('.row').nth(1).click();
        await page.locator(`#host [data-target="${other.id}"]`).click();
        assert.equal(await page.locator('#host .source-target section').first().locator('.id').textContent(),from.id);
        assert.equal(await page.locator(`#host [data-target="${from.id}"]`).count(),0);
        assert.equal(await page.locator(`#host [data-target="${other.id}"]`).getAttribute('class'),'selected-target');
        await page.locator('#host [data-preview]').click();
        assert.equal(await page.locator('#host [role="status"]').last().textContent(),`Preview ready for ${from.id} → ${other.id}. No repository changes made.`);
        await page.locator('.row').nth(0).click();
        await page.locator('#sheet [data-tool="Edit description"]').click();
        await page.locator('#host textarea').fill('Draft for first source');
        await page.locator('.row').nth(1).click();
        await page.locator('#host textarea').fill('First draft after browsing another revision');
        await page.locator('#host [data-tool="Commands"]').last().click();
        await page.locator('#host .command[data-tool="New child revision"]').click();
        await page.locator('#host .tabs [data-tool="Edit description"]').click();
        assert.equal(await page.locator('#host textarea').inputValue(),'First draft after browsing another revision');
        assert.equal(await page.locator('#host textarea').getAttribute('data-draft-source'),from.id);
        await page.locator('#host [data-preview]').click();
        assert.equal(await page.locator('#host [role="status"]').last().textContent(),`Preview ready for ${from.id}. No repository changes made.`);
        await page.locator('#host [data-close-host]').click();
        await page.locator('#sheet [data-tool="Edit description"]').click();
        assert.equal(await page.locator('#host textarea').inputValue(),other.title,'another source must not inherit the first draft');
        await page.locator('#host textarea').fill('Draft for second source');
        await page.locator('#host [data-close-host]').click();
        await page.locator('.row').nth(0).click();
        await page.locator('#sheet [data-tool="Edit description"]').click();
        assert.equal(await page.locator('#host textarea').inputValue(),'First draft after browsing another revision');
        await page.screenshot({path:`${output}/B-pinned-tasks.png`});
    });
    await check('B-full-commands',{width:1440,height:844},async page=>{
        await open(page,'B');
        await page.locator('.row').nth(2).click();
        let source=await page.evaluate(()=>window.REVISIONS[2].id);
        await page.locator('#sheet [data-full]').click();
        let fullURL=page.url();
        await page.locator('#destination [data-tool="Commands"]').click();
        assert.equal(await page.locator('#destination #search').isVisible(),true);
        assert.equal(await page.locator('#workspace').evaluate(element=>element.inert),true);
        await page.locator('#destination .command[data-tool="Move revision"]').click();
        await page.locator('#destination [data-target]').first().click();
        await page.locator('#destination [data-preview]').click();
        assert.match(await page.locator('#destination [role="status"]').last().textContent(),new RegExp(`Preview ready for ${source} → `));
        await page.screenshot({path:`${output}/B-full-commands.png`});
        await page.locator('#destination [data-back]').click();
        await page.waitForURL(fullURL);
        assert.equal(await page.locator('#destination h1').textContent(),'Revision');
    });
}finally{await browser.close()}
console.log(JSON.stringify(results));
