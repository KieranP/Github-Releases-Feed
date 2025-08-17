<script lang="ts">
  interface Props {
    onlogin: (inputValue: string) => void
  }

  const { onlogin }: Props = $props()

  let inputValue = $state('')
</script>

<div id="login">
  <div>
    <input
      placeholder="github_pat_..."
      type="text"
      bind:value={inputValue}
    />

    <button
      disabled={!inputValue}
      onclick={(): void => {
        onlogin(inputValue)
      }}
      type="button">Load</button
    >
  </div>

  <div>
    <details name="faq">
      <summary>What does this service do? Why does it exist?</summary>
      <p>
        The Github activity feed that shows when you first log in is notoriously
        broken. Sometimes is shows everything it should, sometimes it shows
        nothing, and most times it shows something in between. It is almost
        impossible to get a reliable list of all recent releases for starred
        repositories.
      </p>
      <p>
        This service was created to resolve that issue. You provide a Github
        Personal Access Token which has read-only access your starred
        repositories, and it will then fetch the last month of releases for
        those repositories, displaying them from newest to oldest. No fancy
        algorithms or predictions getting in the way; the way all activity feeds
        should be.
      </p>
    </details>

    <details name="faq">
      <summary>How does this service work? What are the limitations?</summary>
      <p>
        After you provide a Github Personal Access Token with read-only access
        to your starred repositories, it uses that token in conjunction with
        Github's oktokit.js package to make requests to Github's GraphQL API. It
        fetches your starred repositories along with their releases, and then
        loops over, processes, and displays the results in a clear and
        informative way. The Github Personal Access Token is saved in the
        browsers local storage so that you do not need to keep providing it each
        time you access this service.
      </p>
      <p>
        Because of limitations with Github's GraphQL API, this service cannot
        fetch all releases at once. Instead, it needs to fetch releases in small
        batches (currently 5 because fetching more seems to result in network
        timeouts). Each batch is then added to the results set, and re-sorted by
        release date. Therefore, as more results trickle in, the feed jumps
        around until all results are loaded. It is recommended to wait until the
        loading bar reaches 100% before scrolling the feed so as not miss
        anything.
      </p>
    </details>

    <details name="faq">
      <summary>Do you need access to my Github account? Is this safe?</summary>
      <p>
        We will never ask for your email and password. Instead, this service
        uses Github's Personal Access Token functionality. The token you supply
        is stored in your browsers local storage; we never see it because it
        never leaves your computer. Additionally, we recommend using Github's
        fine-grained access tokens, which allow you to limit the tokens ability
        to allow only read-only access to the repositories you have starred.
      </p>
      <p>
        This service is also open-sourced, available <a
          href="https://github.com/KieranP/Github-Releases-Feed"
          rel="noopener noreferrer"
          target="_blank">here</a
        >. So you can examine exactly what the service does should you continue
        to have questions about security. You can download and run the service
        locally. And you can make changes to enhance the service should you wish
        (we'd love a Pull Request that improves performance).
      </p>
    </details>

    <details
      name="faq"
      open
    >
      <summary>How do I generate a Github Personal Access Token?</summary>
      <p>
        Start by creating a <a
          href="https://github.com/settings/personal-access-tokens/new"
          rel="noopener noreferrer"
          target="_blank">Fine-grained Personal Access Token</a
        >. Set whatever value you want for the token name and expiration. Under
        "Permissions > Account permissions > Starring", set that permission to
        "Access: Read-only". Leave all other settings as their default. Click
        "Generate token". Then copy the resulting token into the box above and
        click "Load".
      </p>
    </details>
  </div>
</div>

<style>
  #login {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;

    input,
    button {
      margin: 0;
      padding: 5px 10px;
      line-height: 35px;
      font-size: 20px;
    }

    input {
      width: 79%;
    }

    button {
      width: 20%;
    }

    details {
      margin: 20px 0;

      summary {
        cursor: pointer;
      }
    }
  }
</style>
